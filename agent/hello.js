var agent = require('./_header')
  , device = require('../device.sample');

 agent.createMessage()
  .device(device)
  .alert('Hello Universe!')
  .send();

  console.log("sent message")