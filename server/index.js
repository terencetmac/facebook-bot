'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const { db } = require('../database/index.js')
const pgp = require('pg-promise')();
const app = express()


// Set port number to 3000
app.set('port', (process.env.PORT || 3000))

// Body parser for url encoded and application json
app.use(bodyParser.urlencoded({
  extended: false
}))

app.use(bodyParser.json())

// Index route
app.get('/', (req, res) => {
  res.send('Heya, I\'m your new chat bot!')
})

// Facebook verification
app.get('/webhook/', (req, res) => {
  if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
    res.status(200).send(req.query['hub.challenge'])
  }
  res.status(403).send('Error, wrong token')
})

// Post data to Facebook
app.post('/webhook/', (req, res) => {
  let messaging_events = req.body.entry[0].messaging
  for (let i = 0; i < messaging_events.length; i++) {
    let event = req.body.entry[0].messaging[i]
    let sender = event.sender.id
    if (event.message && event.message.text) {
      let text = event.message.text
      // Store user details in database
      addUser(sender)

      // User asks for active to-do list
      if (text === 'LIST'){ 
        activeToDo(sender)
        break
      // User marks a certain to-do list item as DONE
      } else if (text.endsWith('DONE')) {
        let itemNumber = text.replace(/ \b\w*?DONE\w*?\b/g, '').split('#')[1]
        markAsDone(sender, itemNumber)
        break
      // User deletes a certain item
      } else if (text.endsWith('DELETE')) {
        let itemNumber = text.replace(/ \b\w*?DELETE\w*?\b/g, '').split('#')[1]
        deleteItem(sender, itemNumber)
        break
      // User adds an item to the to-do list
      } else if (text.startsWith('ADD')) {
        let item = text.replace(/^\S+/g, '').trim()
        addItem(sender, item)
        break
      // User marks the whole list as SMASHED IT
      } else if (text === 'SMASHED IT') {
        markAllDone(sender)
        break
      }

      sendTextMessage(sender, text.substring(0, 200));
      break;
    }
    if (event.postback) {
      let text = JSON.stringify(event.postback)
      sendTextMessage(sender, text.substring(0, 200), token)
    }
  }
  res.sendStatus(200)
})

const token = process.env.FB_PAGE_TOKEN

// Function to send messages
function sendTextMessage(sender, text) {
  let messageData = { text:text }
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
  json: {
    recipient: {id:sender},
    message: messageData,
  }
}, function(error, response, body) {
  if (error) {
      console.log('Error sending messages: ', error)
  } else if (response.body.error) {
      console.log('Send message error: ', response.body.error)
    }
  })
}

// Function to add current active user's details to user table
function addUser(sender) {
  return db.query('INSERT INTO users (usertoken) VALUES ($1) ON CONFLICT (usertoken) DO NOTHING RETURNING id', [sender])
}

// Function to return active to-do items with the same user_id as the sender
function activeToDo(sender) {
  return db.query('SELECT id FROM users WHERE usertoken = $1', [sender])
  .then((result) => {
    let id = parseInt(result[0].id)
    return db.query('SELECT item FROM todo WHERE status = FALSE AND user_id = $1', [id])
  })
  .then((result) => {
    for (var i = 0; i < result.length; i++) {
      sendTextMessage(sender, result[i].item)
    }
  })
  .catch((error) => {
    console.log('Unable to retrieve all to-do list items: ', error)
  })
}

// Function for user to mark items as complete
function markAsDone(sender, itemNumber) {
  return db.query('UPDATE todo SET status = TRUE WHERE id = $1', itemNumber)
  .then(() => {
    sendTextMessage(sender, `Your to-do item #${itemNumber} has been marked as done!`)
  })
  .catch((error) => {
    console.log('Unable to mark as done: ', error)
  })
}

// Function to delete items instead of marking as complete
function deleteItem(sender, itemNumber) {
  return db.result('DELETE FROM todo WHERE id = $1', itemNumber)
  .then(() => {
    sendTextMessage(sender, `Your to-do item #${itemNumber} has been deleted!`)
  })
  .catch((error) => {
    console.log('Unable to delete item: ', error)
  })
}

// Function to add item to to-do list
function addItem(sender, item) {
  return db.one('SELECT id FROM users WHERE usertoken = $1', sender)
  .then((result) => {
    return db.one('INSERT INTO todo(item, user_id) VALUES ($1, $2) RETURNING item', [item, result.id])
  })
  .then((result) => {
    console.log(result.item)
    sendTextMessage(sender, `Your to-do item '${result.item}' has been added!`)
  })
  .catch((error) => {
    console.log('Add item error: ', error)
  })
}

// Function for all items on to-do to be marked as done
function markAllDone(sender) {
  return db.query('UPDATE todo SET status = TRUE')
  .then(() => {
    sendTextMessage(sender, 'Congratulations, all your to-do items are complete!')
  })
  .catch((error) => {
    console.log('There was an error marking all items as complete: ', error)
  })
}


// Start server
app.listen(app.get('port'), () => {
  console.log('running on port', app.get('port'))
})