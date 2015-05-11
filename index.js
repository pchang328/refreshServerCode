var http = require('http');
express = require('express');
path = require('path');
var pg = require('pg');
var app = express();
var bodyParser = require('body-parser');
var url = require('url') ;
var plivo = require('./plivo');
var p = plivo.RestAPI(require('./config')); //contains the 
var connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/refresh'

//This is a function that will generate a random string of the specified length. The characters wil
//be restricted to those specified by chars.
function randomString(length, chars) {
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
    return result;
}

//For push notifications
/*var agent = require('./agent/_header')
  , device = require('./device.sample');*/

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.set('port', (process.env.PORT || 5000));

//You have parsed your request body into a JSON format
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ 
  extended: true 
}));

app.use(express.static(__dirname + '/public'));

/*var counter = 0
//This will query the server every 1/2 second
setInterval(function(){
  var queryString = "select online from status where phonenumber = '8885555512';";
  pg.connect(connectionString, function(err, client, done) {
      console.log(queryString);
      var query = client.query(queryString);
      query.on('row', function(row) {
        if (counter == 0) 
        {
          online = row.online;
          counter++;
        }

        else 
        {
          if (online != row.online && row.online == 2)
          {
            agent.createMessage()
            .device(device)
            .alert('dude with phonenumber 8885555512 has just become onlin')
            .send();
          }
        }
      });
       query.on('end', function() 
        {
          client.end();
        });
  });
}, 500);    */  

//default landing page
app.get('/', function (req, res) {
  res.send('<html><body><h1>Welcome to the Refresh Home Page!! :D :D :D </h1></body></html>');
  /*agent.createMessage()
  .device(device)
  .alert('Hello Universe!')
  .send();*/

});


//Sending via SMS a random code to the phonenumber specified by the HTTP get request. If the 
//phonenumber that you sned in the url already exists on the server, a new random code is 
//generated and is updated on the server. 

//check to see if SMS was successful. If it wasn't succesful then detect...
app.post('/preverify', function (request, response) {
  var phone = request.body.phone;
  var rString = randomString(4, '0123456789');

  var params = {
      'src': '13303823400', // Caller Id - just using the Plivo number
      'dst' : phone, // User Number to Call -
      'text' : "Hi! This is your Refresh confirmation code " + rString,
      'type' : "sms"
  };
  // console.log(params)

  p.send_message(params, function (status, response) {
      console.log('Status: ', status);
      console.log('API Response:\n', response);
  });

  //Updating the remote database and post the phonenumber with default contact and status
  //The default status is offline
  var update = "update status set code = '" + rString+ "' where phonenumber = '" + phone + "';";
  var insert = "insert into status (phonenumber, contacts, online, code, verified, time) ";
  insert += "select '" + phone + "' , '{}' , 0, '" + rString + "', false ," + "-1"
  insert += "where not exists (select 1 from status where phonenumber = '" + phone + "');"

  console.log(insert)

  var success = true; 
  pg.connect(connectionString, function(err, client, done) {
    client.query(update, function(err, result) {
          done();
          if (err) {
            console.log(err); response.send("Error: "+err)
            success = false;
          }
        });
    client.query( insert, function(err, result) {
      done();
      if (err) {
        console.log(err); response.send("Error: "+err)
        success = false;
        }
      });
    });
  if (success) 
    response.status(200).end();
  else 
    response.status(500).end();
})

app.post('/verify', function (request, response) {
  var phone = request.body.phone;
  var code = request.body.code;
  var success = true; 

  console.log(phone)
  console.log(code)

  var update = "update status set verified = true where phonenumber = '" + phone + "' and code = '" + code +"';"

  pg.connect(connectionString, function(err, client, done) {
        var query = client.query(update);

        //'end' returns after all queries have already finished
        query.on('end', function(result) 
        {
          //console.log(result.rowCount)
          var rowsUpdated = result.rowCount;
          client.end();
          if (rowsUpdated == 1)
            return response.send(true)
          else 
            return response.send(false)
        });
    });
})

//Getting status of idOther when your id is idYou. idYou does not have to be in the server database
//0 is unavaialable, 1 is unknown, 2 is avaialable
//curl -X POST -H "Content-Type: application/json" --data @getTesting.json http://localhost:5000/db/getStatus/hey
app.post('/db/getStatus/:idYou', function (request, response) {
  var returnJSON = {};
  var phoneYou = request.params.idYou;
  var otherPeoplePhone= request.body.phonenumbers;
  console.log(otherPeoplePhone)
  console.log(phoneYou)
  var queryString = ""
  var d = new Date();
  var time = d.getTime();

  for (i = 0; i < otherPeoplePhone.length - 1; i++) 
    queryString += "phonenumber = '" + otherPeoplePhone[i] + "' or ";
  if (otherPeoplePhone.length > 0) queryString += "phonenumber = '" + otherPeoplePhone[otherPeoplePhone.length - 1] + "'"

  if (otherPeoplePhone.length === 0) queryString = "phonenumber = ''"
  var getString = "select phonenumber, contacts, online, time from status where " + queryString + ";"
  console.log(getString)

  pg.connect(connectionString, function(err, client, done) {
        var query = client.query(getString);
        //query.on will iterate through each row
        query.on('row', function(row) {
          //console.log(row)
          var contacts = row.contacts;
          //console.log(contacts)
          var online = row.online;
          var timePrev = row.time; 
          var diff = time - timePrev; //automatic casting for timePrev into a number
          var phonenumber = row.phonenumber;

          var foundYou = false;
          for (var i = 0; i < contacts.length; i++) {
            var online_time_pair;
            if (row.contacts[i] === phoneYou) {
              if (online == 2) online_time_pair = [online, 0]
              else if (online == 0 && timePrev != -1) online_time_pair = [online, diff/60000];
              else if (online == 0 && timePrev == -1) online_time_pair = [online, -1];
              else online_time_pair = [online, -1];
              returnJSON[phonenumber] = online_time_pair;
              foundYou = true;
            }
          }
          if (foundYou == false)
            returnJSON[phonenumber] = [1, -1];
        });
        
        //After all data is returned, close connection and return results
        query.on('end', function() 
        {
            console.log("DUDDDDEEEE");
            console.log(returnJSON);
            //Accounting for whether a phonenumber does not exist in the database
            for (var i = 0; i < otherPeoplePhone.length; i++) {
                if (!returnJSON.hasOwnProperty(otherPeoplePhone[i]))
                  returnJSON[otherPeoplePhone[i]] = [1, -1];
              }
              console.log(returnJSON);
          client.end();
          return response.send(returnJSON);
        });
    });
})

app.post('/receive_sms/', function (req, res) {
  var from = req.param("From");
  var to = req.param("To");
  var text = req.param("Text");

  console.log("from: " + from)
  console.log("to:" + to)
  console.log("text:" + text)
})


//Sending a new contact to the database - defaults the code to none 
//curl -X POST -H "Content-Type: application/json" --data @postTesting.json http://localhost:5000/db/phonenumberOfUser
app.post('/db/:id', function (request, response) {
  var tablename = "status";
  var phonenumber = request.params.id;
  var contacts = request.body.contacts;
  var status = request.body.status;
  var contactString = "";
  for (i = 0; i < contacts.length - 1; i++)
    contactString += contacts[i] + " ,"
  if (contacts.length > 0) contactString += contacts[contacts.length-1]

  var update = "update status set contacts =  '{" + contactString + "}', online =  " + status + " where phonenumber = '" + phonenumber + "';";
  var insert = "insert into status (phonenumber, contacts, online, code, verified, time) ";
  insert += "select '" + phonenumber + "' , '{" + contactString + "}' , " + status + ", 'none', false ," + "-1 "
  insert += "where not exists (select 1 from status where phonenumber = '" + phonenumber + "');"

  console.log(update)
  console.log(insert)
  var success = true; 
  pg.connect(connectionString, function(err, client, done) {
    client.query(update, function(err, result) {
          done();
          if (err) {
            console.log(err); response.send("Error: "+err)
            success = false;
          }
        });
    client.query( insert, function(err, result) {
      done();
      if (err) {
        console.log(err); response.send("Error: "+err)
        success = false;
        }
      });
    });
      if (success)
        response.status(200).end();
      else response.status(500).end();
  })

//Updating the status of person with phone number id
//curl -X PUT -H "Content-Type: application/json" --data @statusUpdateTesting.json http://localhost:5000/db/status/phonenumber
app.put('/db/status/:id', function (request, response) 
{
  var tablename = "status";
  var status = request.body.status;
  console.log(status)
  var phone = request.params.id;
  var d = new Date();
  var time = d.getTime(); //This method gets the number of milliseconds from January 1, 1970

  //Only update the time if the status actually changes
  var update = "update status set online =  " + status + ", time = " + time + " where phonenumber = '" + phone + "'and online != " + status + ";";

  console.log(update)
  var success = true; 
  pg.connect(connectionString, function(err, client, done) 
  {
    client.query(update, function(err, result)
    {
      done();
      if (err) {
        console.log(err); response.send("Error: "+err)
        success = false;
      }
    });
  });
  if (success)
    response.status(200).end();
  else response.status(500).end();
})

//Update the contact list - bruteforce method (uploads the entire contact list again -
//hence deals with both the deletion and addition of contact, pushes responsiblity to client)
app.put('/db/contacts/:id', function (request, response) 
{
  var tablename = "status";
  var contacts = request.body.contacts;
  var phone = request.params.id;
  var contactString = ""
  //console.log(contacts);
  for (i = 0; i < contacts.length - 1; i++)
    contactString += contacts[i] + " ,"
  if (contacts.length > 0) contactString += contacts[contacts.length-1]

  var update = "update status set contacts =  '{" + contactString + "}' where phonenumber = '" + phone + "';";

  console.log(update)
  var success = true; 
  pg.connect(connectionString, function(err, client, done) 
  {
    client.query(update, function(err, result)
    {
      done();
      if (err) {
        console.log(err); response.send("Error: "+err)
        success = false;
      }
    });
  });
  if (success)
    response.status(200).end();
  else response.status(500).end();
})

//Delete user from database with phone number id
app.delete('/db/:id', function (request, response) 
{
  var tablename = "status";
  var phone = request.params.id;
  var deletion = "delete from status where phonenumber = '" + phone + "';"
  console.log(deletion);
  var success = true;
  pg.connect(connectionString, function(err, client, done) 
  {
    client.query(deletion , function(err, result)
    {
      done();
      if (err) {
        console.log(err); response.send("Error: "+err)
        success = false;
      }
    });
  });
  if (success)
    response.status(200).end();
  else response.status(500).end();
})

/*Causes the 404 page to be loaded (the Not Found error - when the 
requested content cannot be found) app.use matches all requests.
When placed at the very end, it becomes a catch-all*/
app.use(function (req,res) {
    res.render('404', {url:req.url});
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));

});