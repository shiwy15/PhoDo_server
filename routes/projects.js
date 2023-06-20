const express = require('express');
const router = express.Router();
const User = require('../models/usermodel'); // Requiring user model
const Edge = require('../models/edge');
const Project = require('../models/project');
const { route } = require('./users');
const nodemailer = require('nodemailer');

// Create new project
router.post('/project', async (req, res) => {
    const name = req.body.name;
    const userId = req.user._id;
    console.log("유저" + userId)

    const newProject = new Project({
        name: name,
        userIds: [userId],
        nodeIds: [],
        edgeIds: []
    });

    try {
        const savedProject = await newProject.save();
        
        const user = await User.findById(userId);
        user.projectId.push(savedProject._id);
        await user.save();

        res.status(200).json({ "id" : savedProject._id});
    } catch (err) {
        res.status(500).json({ message: err });
    }
});

/* 프로젝트에 새로운 유저 추가 */
router.post('/project/:projectId', async(req, res) => {
    try { 
        const curUser   = await User.findById(req.user._id);
        const projectId = req.params.projectId;
        const InvitedUserEmail = req.body.userEmail;  
        const InvitedUser = await User.findOne({'email' : InvitedUserEmail})
        
        // 방에 포함된 유저인지 확인
        if (!curUser.projectId.includes(projectId)) {
            return res.status(400).json({message: "You're not part of this project"}) }
    
        // 해당하는 유저 이메일로 초대 이메일 발송
        let smtpTransport = nodemailer.createTransport({
            service: 'Gmail',
            auth : {
            user : process.env.GMAIL_EMAIL,
            pass : process.env.GMAIL_PASSWORD
            }
        });
        
        const project = await Project.findById(projectId);
        const domain = process.env.LOCAL_SERVER; // 배포시 바꿔줘야 함

        let mailOptions = {
            to: InvitedUserEmail,
            from : '1park4170@gmail.com',
            subject : curUser.name + '님이 초대하신' + project.name + '프로젝트에 참여하세요!!',
            text : '다음의 링크를 클릭하시면 프로젝트 창으로 이동할 수 있습니다' + domain + '/project/' + InvitedUser.email + '/' + projectId
        };
        
        smtpTransport.sendMail(mailOptions, err=> {
            res.status(200).json({'message': 'Email send with further instructions. Please check that.'});
          });

        res.status(200).json({message: "Invitation successfully sent"});

    } catch (err) {
        console.log(err);
        res.status(500).json({message: "Something went wrong."});
    }
}) 

// 해당 이메일 클릭시 유저와 project document 모두에 join 사실 반영
router.get('/project/:newUserEmail/:projectId', async(req, res) => {
    try {
        newUser = await User.findOne({ 'email' : req.params.newUserEmail });
        project = await Project.findById(req.params.projectId);


        if (!newUser) {
            res.status(400).json({ 'message': 'No Such User' });
        }

        if (!project) {
            res.status(400).json({ 'message': 'No Such Project' });
        }


        /* 유저 - 프로젝트 연결 */
        await project.userIds.push(newUser._id);
        await newUser.projectId.push(project._id); 


        await project.save();
        await newUser.save();


        res.status(200).json({ 'message': 'success fully joined to new project' });

        // 프로젝트로 리다이렉트 필요??
    } catch(err) {
        console.log(err)
        res.status(500).json({ 'message': err });
    }
})

// Rename project
router.patch('/project/:projectId', async (req, res) => {
    const projectId = req.params.projectId;
    const newName = req.body.name;

    try {
        // Find the project by projectId and update
        const project = await Project.findByIdAndUpdate(
            projectId, 
            { name: newName }, 
            { new: true } // This option returns the updated document
        );

        if (!project) {
            return res.status(404).json({ message: 'Project not found.' });
        }

        res.status(200).json({ "id" : project._id});
    } catch (err) {
        res.status(500).json({ message: err });
    }
});

// Delete project
router.delete('/project/:projectId', async (req, res) => {
    const projectId = req.params.projectId;
    const userId = req.user._id;

    try {
        // Find the project by projectId
        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ message: 'Project not found.' });
        }

        // Loop through nodeId array and delete each node
        for (let nodeId of project.nodeIds) {
            await Node.findByIdAndDelete(nodeId);
        }

        // Loop through edgeId array and delete each edge
        for (let edgeId of project.edgeIds) {
            await Edge.findByIdAndDelete(edgeId);
        }

        // Finally, delete the project
        await Project.findByIdAndDelete(projectId);
        
        // Remove the project's id from the user's projectId array
        const user = await User.findById(userId);
        user.projectId = await user.projectId.filter(id => !id.equals(projectId));

        await user.save();

        res.status(200).json({ message: 'Project, its nodes, edges and reference from user were successfully deleted.' });
    } catch (err) {
        res.status(500).json({ message: err });
    }
});



module.exports = router;