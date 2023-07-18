//yarn add express-session
//yarn add passport
//yarn add passport-local-mongoose
//yarn add passport-local
//yarn add async
//yarn add nodemailer

const path = require('path');
const express = require('express'); 
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');

const MongoDBStore = require('connect-mongodb-session');
const mongoStore = MongoDBStore(session);

const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const cookieParser = require('cookie-parser');
const SocketIO = require("socket.io");
const http = require("http");
const { saveDataToMongoDB } = require('./redisToMongo');
const { MongoClient } = require('mongodb');


// CORS 옵션 설정
const corsOptions = {
  origin: 'http://localhost:3000',
	// origin:  ['https://www.phodo.store', 'https://jungle-front-f14999pts-jinkyojb.vercel.app/'], // 클라이언트 도메인을 명시적으로 지정하면 보안 상의 이유로 해당 도메인만 요청 허용 가능
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders:  [
    "Content-Type",
    "Content-Length",
    "Accept-Encoding",
    "X-CSRF-Token",
    "Authorization",
    "accept",
    "origin",
    "Cache-Control",
    "X-Requested-With"
  ],  
  credentials : true
};

const PORT = 4000;
const app = express();

// CORS 미들웨어를 사용하여 모든 경로에 대해 CORS 옵션 적용
app.use(cors(corsOptions));

const httpServer = http.createServer(app);
const wsServer = SocketIO(httpServer, {
  cors : corsOptions
});


app.use(cookieParser())

// Requiring user model
const User = require('./models/usermodel');

passport.use(new LocalStrategy({
  usernameField: 'email',   
  passwordField: 'password',   
}, async (email, password, done) => {
  try {
    const exUser = await User.findOne({ email: email });
    if (exUser) {
      exUser.authenticate(password, (err, user, passwordError) => {
        if (passwordError) {
          // Incorrect password
          done(null, false, {message : '비밀번호가 일치하지 않습니다'});
        } else if (err) {
          // Other error
          done(err);
        } else {
          // Success
          done(null, user);
        }
      });
    } else {
      done(null, false, {message : '가입되지 않은 회원입니다'})
    }
  } catch (error) {
    console.error(error);
    done(error);
  }
}));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

dotenv.config({path : './.env'});

const store = new mongoStore({
  collection: "userSessions",
  uri: process.env.mongoURI,
  expires: 1000,
});

// middleware for session
app.set('trust proxy', 1);
app.use(
  session({
    name: "SESSION_NAME",
    secret: process.env.SESSION_SECRET,
    store: store,
    saveUninitialized: false,
    resave: false,
    cookie: {
      // local에서 돌릴 때!
      sameSite: 'lax',
      secure: false,
      // 서버올릴 때!
      // sameSite: 'none',
      // secure: true,
      httpOnly: true,
      maxAge : (4 * 60 * 60 * 1000)
    },
  })
);

app.use(passport.session());
app.use(passport.initialize());

/* 음성채팅 라우트 추가 */
app.get("/chat", (req, res) => {
  res.render("chat");
});

/*--------------------- dohee 추가 : 클라우드 이미지 url ------------------------*/
const fileUpload = require('express-fileupload');
app.use(fileUpload());
/*-------------------------------------------------------------------*/

// PARSE ALL REQUESTS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SERVE STATIC FILES
// app.use(express.static(path.join(__dirname, '../client/dist')));
app.use("/public", express.static(__dirname + "/public"));

const userRoutes = require('./routes/users');
app.use(userRoutes);

// ROUTES
const edgeRoutes = require('./routes/edges');
app.use(edgeRoutes);

const projectRoutes = require('./routes/projects');
app.use(projectRoutes);

const gptRoutes = require('./routes/gpt');
app.use('/gpt', gptRoutes);

app.use('/api', require('./routes/api'));
app.use('', require('./routes/nodes'));

// UNKNOWN ROUTE HANDLER
app.use((req, res) => res.status(404).send('404 Not Found'));

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.set('views', path.join(__dirname, '../client/views'));

// MONGODB CONNECTION
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log(err));

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error(err.stack);
  const defaultErr = {
    log: 'Express error handler caught unknown middleware error',
    status: 400,
    message: { err: 'An error occurred' },
  };
  const errorObj = Object.assign({}, defaultErr, err);
  console.log(errorObj.log);
  return res.status(errorObj.status).json(errorObj.message);
});

/* ------------- ---------  socket 코드  ---  -------------------------- */
app.set("view engine", "pug");
app.set("views", process.cwd() + "/src/views");

let roomObjArr = [
  // {
  //   roomName,
  //   currentNum,
  //   users: [
  //     {
  //       socketId,
  //       nickname,
  //     },
  //   ],
  // },
];
const MAXIMUM = 5;

/* ---------- Redis ------------- */
const redis = require('redis');
const client =  redis.createClient({
  socket: {
      host: 'localhost', 
      port: 6379, // default
      db : 0
  }
});
client.on('connect', function() {
  console.log('Redis client connected');
});
client.on('error', err => console.log('Redis Server Error', err));

/* ----------- Redis -------------- */

// MongoDB 연결 정보
const mongoURI = 'mongodb://localhost:27017';

// MongoDB 클라이언트 생성 및 연결
const mongoClient = new MongoClient(mongoURI);

/* 초기화 함수 */
async function initializeDatabases() {
  try {
    // Redis 연결
    await client.connect();
    console.log('connected to Redis')
    
    // redis client를 애플리케이션 전역에서 사용
    app.locals.redisClient = client;

    // MongoDB 연결
    await mongoClient.connect();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to databases', err);
    process.exit(1); // 프로세스를 종료하고 에러 코드 1을 반환합니다.
  }
}

/* 초기화 함수 */ 
initializeDatabases();

activeProjects = new Set(); // 현재 열려있는 방의 목록들을 추적

wsNamespace = wsServer.of('/ws')

wsNamespace.on("connection", async (socket) => {
  console.log("Socket Connected")
  let myRoomName = null;
  let myNickname = null;

  socket.on("join_room", (roomName, nickname) => {
    myRoomName = roomName;
    myNickname = nickname;

    let isRoomExist = false;
    let targetRoomObj = null;

    // forEach를 사용하지 않는 이유: callback함수를 사용하기 때문에 return이 효용없음.
    for (let i = 0; i < roomObjArr.length; ++i) {
      if (roomObjArr[i].roomName === roomName) {
        // Reject join the room
        if (roomObjArr[i].currentNum >= MAXIMUM) {
          socket.emit("reject_join");
          return;
        }

        isRoomExist = true;
        targetRoomObj = roomObjArr[i];
        break;
      }
    }

    // Create room
    if (!isRoomExist) {
      targetRoomObj = {
        roomName,
        currentNum: 0,
        users: new Set(),
      };
      roomObjArr.push(targetRoomObj);
    }

    // Create user object
    const user = { socketId: socket.id, nickname };

    // Convert Set to array
    const usersArray = Array.from(targetRoomObj.users);
    console.log(usersArray);

    // Check if user exists
    if (!usersArray.some(u => u.nickname === user.nickname)) {
      // User does not exist - add user and emit new_user event
      targetRoomObj.users.add(user);
      console.log(Array.from(targetRoomObj.users));
      ++targetRoomObj.currentNum;

      socket.join(roomName);
      socket.emit("accept_join", [...targetRoomObj.users]);
      socket.to(roomName).emit('new_user', user);
    } else {
      // User exists - just emit accept_join event
      socket.emit("accept_join", [...targetRoomObj.users]);
    }
  });

  socket.on("offer", (offer, remoteSocketId, localNickname) => {
    socket.to(remoteSocketId).emit("offer", offer, socket.id, localNickname);
  });

  socket.on("answer", (answer, remoteSocketId) => {
    socket.to(remoteSocketId).emit("answer", answer, socket.id);
  });

  socket.on("ice", (ice, remoteSocketId) => {
    socket.to(remoteSocketId).emit("ice", ice, socket.id);
  });

  socket.on("disconnecting", () => {
    let isRoomEmpty = false;
    for (let i = 0; i < roomObjArr.length; ++i) {
      if (roomObjArr[i].roomName === myRoomName) {
        const usersArray = [...roomObjArr[i].users];
        const newUsers = usersArray.filter(
          (user) => user.socketId != socket.id
        );
        roomObjArr[i].users = new Set(newUsers);
        --roomObjArr[i].currentNum;

        if (roomObjArr[i].currentNum == 0) {
          isRoomEmpty = true;
        }

        socket.to(myRoomName).emit("leave_room", socket.id, myNickname, [...roomObjArr[i].users]);
      }
    }


    // Delete room
    if (isRoomEmpty) {
      const newRoomObjArr = roomObjArr.filter(
        (roomObj) => roomObj.currentNum != 0
      );
      roomObjArr = newRoomObjArr;
    }
  });
})

  
 wsServer.on("connection", async (socket) => {
  socket.on('yjs-update', async (update) => {
    try {
      const projectId = Object.keys(update)[0]; // This will extract the first key in the 'update' object
      const count = update[projectId].yjsDoc.count; // 현재 방의 인원수
      // const projectObj = await Project.findById(project);
      const yjsDoc = update[projectId].yjsDoc;

      /* 더이상 남아있는 사람이 없으므로, yjsDoc 내용 바로 DB에 쓰고, 레디스의 값은 지워줘야 함 */ 
      if (count <= 0) { 
        const db = mongoClient.db('phodo');
        
        // DB에 노드 저장
        const nodeCollection = db.collection('nodes');
        let updateResult = await nodeCollection.updateOne(
          { projectId: projectId },
          { $set: { "info" : JSON.stringify(yjsDoc.node) }},
          {upsert: true}
        );
    
        // DB에 엣지 저장
        const edgeCollection = db.collection('edges');
        updateResult = await edgeCollection.updateOne(
          { projectId: projectId },
          { $set: { "info" : JSON.stringify(yjsDoc.edge) }},
          {upsert: true}
        );
    
        // Redis에서 해당 projectId의 데이터를 삭제
        client.del(projectId, function(err, response) {
          if (err) {
            console.log(err);
          }
        });
    
        // activeProjects에서 해당 projectId를 삭제
        activeProjects.delete(projectId);
        
      } else { /* redis에 데이터 저장 */  
        activeProjects.add(projectId)
        const yjsDocToString = await JSON.stringify(yjsDoc);
        await client.set(projectId, yjsDocToString, (err) => {
          if (err) console.error(err);
        });
      }
    } 
    catch {
      console.error('Error occurred in yjs-update event handler:', err);
    }
  });
});

/* 60초에 한번씩 redis의 값을 database에 써줘야함 */
/* 15초에 한번씩 redis의 값을 database에 써준다 */
setInterval(async () => {
  if (activeProjects.size > 0) {
    try {
      await saveDataToMongoDB(activeProjects, mongoClient, client);
    } catch (err) {
      console.error("Error saving data to MongoDB:", err);
    }
  }
}, 15000);


httpServer.listen(PORT,() => {
    console.log(`Server started on port ${PORT}`)});

module.exports = wsServer;
