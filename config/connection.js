const mongoClient=require('mongodb').MongoClient
const state={
    db:null
}
module.exports.connect=function(done){
     const url='mongodb+srv://sibinjamessibin:3fGNQfdFxIvCdz0v@cluster0.jvd2rpj.mongodb.net/'

    const dbname='eagle'
    mongoClient.connect(url, {useUnifiedTopology: true,useNewUrlParser: true },(err,data)=>{
        if(err) return done(err)
        state.db=data.db(dbname)
        done()
    })
    
}
module.exports.get=function(){
    return state.db
}
