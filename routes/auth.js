const express = require('express');
const router = express.Router();

const getUserInfo = async (access_token) => {
  try {
    return await fetch("https://kapi.kakao.com/v2/user/me", {
      method: 'POST',
      headers: {
        'Content-type': 'application/x-www-form-urlencoded;charset=utf-8',
        'Authorization': `Bearer ${access_token}`
      }
    }).then(res => res.json());
  }catch(e) {
    return {code : -1, message:"올바르지 않은 access_token입니다."}
  }
};


router.post('/:coperation/access', async (req, res) => {
  console.log("try login : ", req.body.accessToken);
  const userInfo = await getUserInfo(req.body.accessToken);
  console.log("userInfo: ",userInfo);
  if(userInfo.code)
    res.json(userInfo);
  res.json({message:"성공 이제 jwt보내야함",userInfo});
})

module.exports = router;