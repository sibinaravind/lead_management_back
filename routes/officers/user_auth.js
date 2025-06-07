const express = require("express");
const app = express();
app.use(express.json());
require('dotenv').config();
let middleware = require("../../middleware");
const bcrypt = require('bcrypt');
let userHelper=require('../../helpers/user_helper')


app.post('/authUser', async (req, res) => {
    
    try {
        userHelper.authUser(req.body.phone)
            .then(([msg, id]) => {
                if (msg) {
                    return res.status(200).json({ msg: msg, id: id });
                } else {
                    return res.status(500);
                }
            })
            .catch(error => {
                return res.status(500).json({ msg: error });
            });
    } catch (error) {
        return res.status(500).json({ msg: "Unexpected error" });
    }
});
app.post('/sendCode', async (req, res) => {
    userHelper.sendOtp(req.body.phone).then((response)=>{
        if(response){
            return res.status(200).json({ msg: response });
        }
        else
        {
            return res.status(500);
        }
      })
});
app.post('/resendCode', async (req, res) => {
    userHelper.resendCode(req.body.phone).then((response)=>{
        if(response){
            return res.status(200).json({ msg: response });
        }
        else
        {
            return res.status(500);
        }
      })
});
app.post("/verifyPhone", async (req, res) => {
    try {
        userHelper.verifyPhone(req.body).then((response)=>{
            if(response){
                return res.status(200).json({ msg: response });
            }
            else
            {
                return res.status(500).json({ msg: "Unexpected error" });
            }
          })
            .catch(error => {
                return res.status(500).json({ msg: error });
            });
    } catch (error) {
        return res.status(500).json({ msg: "Unexpected error" });
    }
});
app.post("/verifyPassword", async (req, res) => {
    try {
        userHelper.verifyPassWord(req.body).then((response)=>{
            if(response){
                return res.status(200).json({ msg: response });
            }
            else
            {
                return res.status(500).json({ msg: "Unexpected error" });
            }
          })
            .catch(error => {
                return res.status(500).json({ msg: error });
            });
    } catch (error) {
        return res.status(500).json({ msg: "Unexpected error" });
    }
});
app.patch("/signUp", async (req, res) => {
   
    try {
        userHelper.userSignUp(req.body).then((response)=>{
            if(response){
                return res.status(200).json({ msg: response });
            }
            else
            {
                return res.status(500).json({ msg: "Unexpected error" });
            }
          })
            .catch(error => {
                return res.status(500).json({ msg: error });
            });
    } catch (error) {
        return res.status(500).json({ msg: "Unexpected error" });
    }
});
app.post("/forgetPassword", async (req, res) => {
    try {
        userHelper.forgetPassword(req.body._id).then((response)=>{
            if(response){
                return res.status(200).json({ msg: response });
            }
            else
            {
                return res.status(500).json({ msg: "Unexpected error" });
            }
          })
            .catch(error => {
                return res.status(500).json({ msg: error });
            });
    } catch (error) {
        return res.status(500).json({ msg: "Unexpected error" });
    }
});
app.post("/resetPassword", async (req, res) => {
    try {
        userHelper.resetPassword(req.body).then((response)=>{
            if(response){
                return res.status(200).json({ msg: response });
            }
            else
            {
                return res.status(500).json({ msg: "Unexpected error" });
            }
          })
            .catch(error => {
                return res.status(500).json({ msg: error });
            });
    } catch (error) {
        return res.status(500).json({ msg: "Unexpected error" });
    }
});
app.patch("/upload_profile_photo/:_id", async (req, res) => {
    try {
        userHelper.uploadProfileImage(req.files.media,req.params._id).then((response)=>{
            if(response){
                return res.status(200).json({msg:response});
            }
            else
            {
                return res.status(500).json({ msg: "Unexpected error" });
            }
          })
            .catch(error => {
                return res.status(500).json({ msg: error });
            });
    } catch (error) {
        return res.status(500).json({ msg: "Unexpected error" });
    }

  });
  app.get("/dashboard_user_details", async (req, res) => {
    consol
    try {
        userHelper.basicUserDeatils(req.decoded._id).then((response)=>{
            if(response){
                return res.status(200).json({msg:response});
            }
            else
            {
                return res.status(500).json({ msg: "Unexpected error" });
            }
          })
            .catch(error => {
                return res.status(500).json({ msg: error });
            });
    } catch (error) {
        return res.status(500).json({ msg: "Unexpected error" });
    }

  });



module.exports = app;
