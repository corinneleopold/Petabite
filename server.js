/*eslint-env node */
var express = require('express');
var session = require('express-session');
var pg = require('pg');
var bodyParser = require('body-parser');
var http = require('http');
var redirect = require("express-redirect");
var html = require('html');
var path = require('path');
var fs = require('fs-extra');
var busboy = require('connect-busboy');
var multer = require('multer');
var pkgcloud = require('pkgcloud');

var app = express();
redirect(app);

var conString = process.env.ELEPHANTSQL_URL || "postgres://xynsjmye:kGHEeZziADGUXhASuV5yzVaQgQMAybnO@jumbo.db.elephantsql.com:5432/xynsjmye";

var cfenv = require('cfenv');
var appEnv = cfenv.getAppEnv();
var port = (appEnv.port);

// Require pkgcloud
var pkgcloud = require('pkgcloud');
var previousTag = "";

var config = {};
config.provider = "openstack";
config.authUrl = 'https://identity.open.softlayer.com/';
config.useServiceCatalog = true;
// true for applications running inside Bluemix, otherwise false
config.useInternal = false;
config.tenantId = '318a26a5888940f2b0df7f0e271b4f4d'; 
config.userId = 'ca39d3a8692047c1890511d5ef463252';
config.username = 'Admin_29f0ef6023ce78b4d2765a322a4a2dd30cc22df8';
config.password = 'ORwLUebc37RK]a~/';
config.region = 'dallas';
config.keystoneAuthVersion = 'v3';
config.domainId = 'a4ec146564514e418a566d0ad10ac10a';
config.domainName = '986393';

console.log("config: " + JSON.stringify(config));

var storageClient = pkgcloud.storage.createClient(config);
storageClient.auth(function(error) {
	if (error) {
		console.error("storageClient.auth() : error creating storage client: ", error); 
	} else {
		console.log("storageClient.auth() : created storage client.");
	}
});


/*
var readStream = fs.createReadStream('testimg.jpg');
var writeStream = client.upload({
container: 'Pictures',
remote: 'test_image_upload.jpg'
});
writeStream.on('error', function(err) {
console.log("Error");
});

writeStream.on('success', function(file) {
// success, file will be a File model
console.log("Success");
});
readStream.pipe(writeStream);
*/
app.use(bodyParser.urlencoded());
var urlencodedParser = bodyParser.urlencoded({ extended: true })

app.use(express.static('public'));
app.use(busboy()); 
app.use(busboy({ immediate: true }));
var upload = multer();

app.get('/',function(req,res){
	res.sendFile(__dirname + "/index.html");
});

function requireLogin (req, res, next) {
	if (!req.session.user) {
		res.redirect('login.html');
	} else {
		next();
	}
};

app.use(session({
secret: '2C44-4D44-WppQ38S',
duration: 30 * 60 * 1000,
activeDuration: 5 * 60 * 1000,
}));



app.get('/logout.html', function (req, res) {
	req.session.destroy();
	res.redirect('index.html');
}); 

app.get('/dashboard', requireLogin, function (req, res) {
	res.redirect('dashboard.html');
});

app.get('/login', function (req, res) {
	res.redirect('login.html');
});

app.get('/photos', function(req, res) {
	previousTag = "";
	res.redirect('photos.html');
});

app.post('/process_new_image', function(req,res){
	var fstream;
	var caption;
	var tags;
	var file_name;
	
	req.pipe(req.busboy);
	
	req.busboy.on('file', function (fieldname, file, filename) {
		file_name = filename;
		console.log("Uploading: " + filename); 
		fstream = fs.createWriteStream(filename);
		file.pipe(fstream);
		
		var readStream = fs.createReadStream(filename);
		fstream.on('close', function () {
			console.log("File write success.");
			var writeStream = storageClient.upload({
				container: 'Pictures',
				remote: filename
			});
			writeStream.on('error', function(err) {
				console.log("Error uploading file");
				console.error("Error: ", err);
			});

			writeStream.on('success', function(file) {
				// success, file will be a File model
				console.log("Success uploading file");
			});
			readStream.pipe(writeStream);
		});

		console.log("End of file submit");
	});
	
	req.busboy.on('field', function(fieldname, val) {
		console.log(fieldname + ':' + val);
		if (fieldname === 'input_caption') {
			caption = val;
		}
		if (fieldname === 'input_tags') {
			tags = val;
		}
	});
	console.log("caption: " + caption + " tags: " + tags);
	
	var client = new pg.Client(conString);
	console.log("client");
	client.connect(function(err) {
		if(err) {
			console.log("ERROR WHILE ADDING NEW PICTURE")
			return console.error('could not connect to postgres', err);
		}
		var queryString = 'INSERT INTO picturedata VALUES (\'' + file_name + '\', \'' + tags + '\', \'' + caption + '\');';
		console.log('Query String: ' + queryString);
		client.query(queryString, function(err, result) {
			if (err) {
				res.redirect("upload_failed.html");
				return console.error('error running new user query', err);
			}
			console.log('insert statement success');
			client.end();
			res.redirect('dashboard.html');
		});	
	});
	
});

app.post('/process_new_user_post', urlencodedParser, function (req, res) {

	// Prepare output in JSON format
	var response = {
		new_username:req.body.new_username,
		new_password:req.body.new_password
	};
	console.log(response);
	res.redirect("signup_success.html");
	
	var client = new pg.Client(conString);
	client.connect(function(err) {
		if(err) {
			console.log("ERROR WHILE NEW USERING")
			return console.error('could not connect to postgres', err);
		}
		var queryString = 'INSERT INTO users VALUES (\'' + req.body.new_username + '\', \'' + req.body.new_password + '\');';
		console.log('Query String: ' + queryString);
		client.query(queryString, function(err, result) {
			if (err) {
				res.redirect("register_failed.html");
				return console.error('error running new user query', err);
			}
			console.log('insert statement success');
			client.end();
		});	
	});
	
});

app.post('/image_search', urlencodedParser, function (req, res) {
	var response = {
		tag_input:req.body.tag_input
	};
	console.log("Response from search: " + JSON.stringify(response));
	previousTag = response.tag_input;
	console.log("TAG: " + previousTag);
	res.redirect("photos.html");
});

app.get('/database/*', urlencodedParser, function (req, res) {
	//console.log("PATH: " + req.originalUrl);
	var imageNumber = req.originalUrl.substring(15, req.originalUrl.lastIndexOf(".")) - 1;
	//console.log("IMAGE NUMBER: " + imageNumber);
	var queryString;
	if (previousTag !== "") {
		//console.log("TAG IN DATABASE QUERY IS: " + previousTag);
		queryString = "SELECT * FROM picturedata WHERE tags ilike '%" + previousTag + "%';";
	} else {
		queryString = "SELECT * FROM picturedata;";
	}
	
	var client = new pg.Client(conString);
	client.connect(function(err) {
		if(err) {
			console.log("ERROR CONNECTING TO DB");
			//res.redirect("login_failed.html");
			return console.error('could not connect to postgres', err);
		}
		//console.log('Query String: ' + queryString);
		client.query(queryString, function(err, result) {
			//console.log("Querying");
			//console.log("Result: " + JSON.stringify(result));
			if (err) {
				return console.error('error running picture query', err);
			}
			//console.log("rows: " + result.rows.length);
			//console.log("rows results: " + JSON.stringify(result.rows));
			if (imageNumber < result.rows.length) {
				var file_name = result.rows[imageNumber].filename;
				//console.log("filenum: " + imageNumber + "file name: " + file_name);
				var readStream = storageClient.download({
					container: 'Pictures',
					remote: file_name
				});
				
				var writeStream = fs.createWriteStream(file_name);
				readStream.pipe(writeStream);
				
				writeStream.on('finish', function(){
					//console.log("FILE NAME ACTUALLY: " + file_name);
					fs.readFile(file_name, function(err, data) {
						if (err) throw err; // Fail if the file can't be read.
						//console.log("Writing file: " + file_name);
						res.writeHead(200, {'Content-Type': 'image/jpeg'});
						res.end(data); 
					});
				});
				client.end();
			} else {
				var file_name = 'No_Picture_Found.jpg';
				var readStream = storageClient.download({
					container: 'Pictures',
					remote: file_name
				});
				
				var writeStream = fs.createWriteStream(file_name);
				readStream.pipe(writeStream);
				
				writeStream.on('finish', function(){
					//console.log("FILE NAME ACTUALLY: " + file_name);
					fs.readFile(file_name, function(err, data) {
						if (err) throw err; // Fail if the file can't be read.
						//console.log("Writing file: " + file_name);
						res.writeHead(200, {'Content-Type': 'image/jpeg'});
						res.end(data); 
					});
				});
				client.end();
			}
		});
	});	
});

app.post('/process_login_post', urlencodedParser, function (req, res) {
	var response = {
		username:req.body.login_name,
		password:req.body.login_pass,
	};
	console.log(response);
	
	var client = new pg.Client(conString);
	client.connect(function(err) {
		if(err) {
			console.log("ERROR CONNECTING TO DB");
			res.redirect("login_failed.html");
			return console.error('could not connect to postgres', err);
		}
		var queryString = "SELECT * FROM users WHERE username=\'" + req.body.login_name + "\';";
		console.log('Query String: ' + queryString);
		client.query(queryString, function(err, result) {
			console.log("Querying");
			if (err) {
				console.log("error1");
				res.redirect("login_failed.html");
				return console.error('error running login query', err);
			}
			if (result.rows[0]) {
				console.log("User found!");
				console.log("password found: " + result.rows[0].password);
				if (result.rows[0].password === req.body.login_pass) {
					req.session.user = req.body.login_name;
					console.log("SESSIONUSER: " + req.session.user);
					console.log("Login success!");
					res.redirect("dashboard.html");
				} else {
					console.log("Error2");
					res.redirect("login_failed.html");
					return console.error('Incorrect Password', err);
				}
				client.end();
			} else {
				console.log("User not found!");
				res.redirect("login_failed.html");
			}
			
		});	
	});

});

var server = app.listen(port, appEnv.bind, function () {

	var host1 = server.address().address
	var port1 = server.address().port

	console.log("Example app listening at http://%s:%s", host1, port1)

})
