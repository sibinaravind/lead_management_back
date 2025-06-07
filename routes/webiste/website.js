const express = require("express");

var router = express.Router();

router.get('/', async (req, res) => {
  
    res.render('affinix', {  });
})


module.exports = router;


