const functions=require("firebase-functions");

exports.mail=functions.https.onRequest((request, response)=>{
	if(request.method=="POST"){
		const admin=require("firebase-admin");
		if(!admin.apps.length)admin.initializeApp(functions.config().firebase);
		admin.database().ref().child("orders").child(request.body.order_id).once("value").then(function(snap){
			var order=snap.val();
			var smtpTransport=require("nodemailer").createTransport({host: store(order.store).smtp.host, port: 465, secure: true, auth: {user: store(order.store).smtp.user, pass: store(order.store).smtp.pass}});	
			smtpTransport.sendMail({from: store(order.store).smtp.user, to: store(order.store).smtp.user, subject: `Message from order #${request.body.order_id}`, text: `${request.body.comment} / ${request.body.email?request.body.email:order.email}`, html: `${request.body.comment}<hr>${request.body.email?request.body.email:order.email}`}, function(error, response){
			    if(error){
			        console.log(error);
			    }else{
			        console.log("Message sent: " + response.message);
			    }
			    smtpTransport.close();
			});
			response.status(200).send("Ваше письмо отправлено!");
		});
	}else{
		response.status(404).send("404");
	};
});