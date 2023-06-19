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
const flash = require('connect-flash');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const cookieParser = require('cookie-parser');

const PORT = 4000;
const app = express();

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



// CORS 옵션 설정
const corsOptions = {
  origin: 'http://3.36.77.22:3000', // 클라이언트 도메인을 명시적으로 지정하면 보안 상의 이유로 해당 도메인만 요청 허용 가능
  methods: 'GET, POST',
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

// CORS 미들웨어를 사용하여 모든 경로에 대해 CORS 옵션 적용
app.use(cors(corsOptions));

const store = new mongoStore({
  collection: "userSessions",
  uri: process.env.mongoURI,
  expires: 1000,
});

// middleware for session
app.use(
  session({
    name: "SESSION_NAME",
    secret: "SESS_SECRET",
    store: store,
    saveUninitialized: false,
    resave: false,
    cookie: {
      sameSite: 'lax',
      secure: false,
      httpOnly: true,
      maxAge : (4 * 60 * 60 * 1000)
    },
  })
);

app.use(passport.session());
app.use(passport.initialize());

/*--------------------- dohee 추가 : 클라우드 이미지 url ------------------------*/
// npm install : dotenv, path, express, mongoose, cookieParser
const fileUpload = require('express-fileupload');
app.use(fileUpload());



/*-------------------------------------------------------------------*/

// PARSE ALL REQUESTS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SERVE STATIC FILES
app.use(express.static(path.join(__dirname, '../client/dist')));

const userRoutes = require('./routes/users');
app.use(userRoutes);

// ROUTES
// const userRoutes = require('./routes/users');
const edgeRoutes = require('./routes/edges');
app.use(edgeRoutes);

const projectRoutes = require('./routes/projects');
app.use(projectRoutes);

app.use('/api', require('./routes/api'));
app.use('', require('./routes/nodes'));

//HANDLE CLIENT-SIDE ROUTING
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// passport.use(new LocalStrategy({usernameField : 'email'}, User.authenticate()));
  
// UNKNOWN ROUTE HANDLER
app.use((req, res) => res.status(404).send('404 Not Found'));

// // setting middleware globally
// app.use((req, res, next) => {
//   res.locals.success_msg = req.flash(('success_msg'));
//   res.locals.error_msg = req.flash(('error_msg'));
//   res.locals.error = req.flash(('error'));
//   res.locals.currentUser = req.user;
//   next();
// });

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

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.set('views', path.join(__dirname, '../client/views'));
// app.use(express.static('public'));

// MONGODB CONNECTION
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log(err));

// SERVER LISTEN
// app.listen(PORT, () => {
//   console.log(`Server started on port ${PORT}`);
// });

module.exports = app;
