const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const https = require('https').createServer({
  key: fs.readFileSync('localhost.key'),
  cert: fs.readFileSync('localhost.cert')
}, app);
const ws = require('ws');
//const io = require('socket.io')(https, {transports: ['websocket']});
const kurento = require('kurento-client');
const compression = require('compression');

app.use(compression());

app.use(express.json());
app.use(express.urlencoded({extended: false}));

app.use(express.static('build'));
app.use(express.static('public'));

app.all('*', function (req, res) {
  res.sendFile(path.resolve(__dirname + '/build/index.html'));
});

let wss = new ws.Server({
  server: https,
  path: '/one2many'
});

let idCounter = 0;
let candidatesQueue = {};
let kurentoClient = null;
let presenter = null;
let viewers = [];
let noPresenterMessage = 'No active presenter. Try again later...';

let getUniqueId = () => {
  idCounter += 1;
  return idCounter;
};

wss.on('connection', ws => {
  let sessionId = getUniqueId();
  console.log('Connection received with sessionId ' + sessionId);

  ws.on('error', error => {
    console.log('Connection ' + sessionId + ' error');
    stop(sessionId);
  });

  ws.on('close', () => {
    console.log('Connection ' + sessionId + ' closed.');
    stop(sessionId);
  });

  ws.on('message', _message => {
    let message = JSON.parse(_message);
    console.log('Connection ' + sessionId + ' received message ', message);

    switch (message.id) {
      case 'presenter':
        startPresenter(sessionId, ws, message.sdpOffer, function (error, sdpAnswer) {
          if (error) {
            return ws.send(JSON.stringify({
              id: 'presenterResponse',
              response: 'rejected',
              message: error
            }));
          }
          ws.send(JSON.stringify({
            id: 'presenterResponse',
            response: 'accepted',
            sdpAnswer: sdpAnswer
          }));
        });
        break;

      case 'viewer':
        startViewer(sessionId, ws, message.sdpOffer, function (error, sdpAnswer) {

          if (error) {
            return ws.send(JSON.stringify({
              id: 'viewerResponse',
              response: 'rejected',
              message: error
            }));
          }

          ws.send(JSON.stringify({
            id: 'viewerResponse',
            response: 'accepted',
            sdpAnswer: sdpAnswer
          }));
        });
        break;

      case 'stop':
        stop(sessionId);
        break;

      case 'onIceCandidate':
        onIceCandidate(sessionId, message.candidate);
        break;

      default:
        ws.send(JSON.stringify({
          id: 'error',
          message: 'Invalid message ' + message
        }));
        break;
    }
  });
});

function getKurentoClient(callback) {
  if (kurentoClient !== null) {
    return callback(null, kurentoClient);
  }

  kurento("Your Server URL Here", function (error, _kurentoClient) {
    if (error) {
      console.log("Could not find media server at address " + argv.ws_uri);
      return callback("Could not find media server at address" + argv.ws_uri
        + ". Exiting with error " + error);
    }

    kurentoClient = _kurentoClient;
    callback(null, kurentoClient);
  });
}

function startPresenter(sessionId, ws, sdpOffer, callback) {
  clearCandidatesQueue(sessionId);

  if (presenter !== null) {
    stop(sessionId);
    return callback("Another user is currently acting as presenter. Try again later ...");
  }

  presenter = {
    id: sessionId,
    pipeline: null,
    webRtcEndpoint: null
  };

  getKurentoClient(function (error, kurentoClient) {
    if (error) {
      stop(sessionId);
      return callback(error);
    }

    if (presenter === null) {
      stop(sessionId);
      return callback(noPresenterMessage);
    }

    kurentoClient.create('MediaPipeline', function (error, pipeline) {
      if (error) {
        stop(sessionId);
        return callback(error);
      }

      if (presenter === null) {
        stop(sessionId);
        return callback(noPresenterMessage);
      }

      presenter.pipeline = pipeline;
      pipeline.create('WebRtcEndpoint', function (error, webRtcEndpoint) {
        if (error) {
          stop(sessionId);
          return callback(error);
        }

        if (presenter === null) {
          stop(sessionId);
          return callback(noPresenterMessage);
        }

        presenter.webRtcEndpoint = webRtcEndpoint;

        if (candidatesQueue[sessionId]) {
          while (candidatesQueue[sessionId].length) {
            var candidate = candidatesQueue[sessionId].shift();
            webRtcEndpoint.addIceCandidate(candidate);
          }
        }

        webRtcEndpoint.on('OnIceCandidate', function (event) {
          var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
          ws.send(JSON.stringify({
            id: 'iceCandidate',
            candidate: candidate
          }));
        });

        webRtcEndpoint.processOffer(sdpOffer, function (error, sdpAnswer) {
          if (error) {
            stop(sessionId);
            return callback(error);
          }

          if (presenter === null) {
            stop(sessionId);
            return callback(noPresenterMessage);
          }

          callback(null, sdpAnswer);
        });

        webRtcEndpoint.gatherCandidates(function (error) {
          if (error) {
            stop(sessionId);
            return callback(error);
          }
        });
      });
    });
  });
}

function startViewer(sessionId, ws, sdpOffer, callback) {
  clearCandidatesQueue(sessionId);

  if (presenter === null) {
    stop(sessionId);
    return callback(noPresenterMessage);
  }

  presenter.pipeline.create('WebRtcEndpoint', function (error, webRtcEndpoint) {
    if (error) {
      stop(sessionId);
      return callback(error);
    }
    viewers[sessionId] = {
      "webRtcEndpoint": webRtcEndpoint,
      "ws": ws
    }

    if (presenter === null) {
      stop(sessionId);
      return callback(noPresenterMessage);
    }

    if (candidatesQueue[sessionId]) {
      while (candidatesQueue[sessionId].length) {
        var candidate = candidatesQueue[sessionId].shift();
        webRtcEndpoint.addIceCandidate(candidate);
      }
    }

    webRtcEndpoint.on('OnIceCandidate', function (event) {
      var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
      ws.send(JSON.stringify({
        id: 'iceCandidate',
        candidate: candidate
      }));
    });

    webRtcEndpoint.processOffer(sdpOffer, function (error, sdpAnswer) {
      if (error) {
        stop(sessionId);
        return callback(error);
      }
      if (presenter === null) {
        stop(sessionId);
        return callback(noPresenterMessage);
      }

      presenter.webRtcEndpoint.connect(webRtcEndpoint, function (error) {
        if (error) {
          stop(sessionId);
          return callback(error);
        }
        if (presenter === null) {
          stop(sessionId);
          return callback(noPresenterMessage);
        }

        callback(null, sdpAnswer);
        webRtcEndpoint.gatherCandidates(function (error) {
          if (error) {
            stop(sessionId);
            return callback(error);
          }
        });
      });
    });
  });
}

function clearCandidatesQueue(sessionId) {
  if (candidatesQueue[sessionId]) {
    delete candidatesQueue[sessionId];
  }
}

function stop(sessionId) {
  if (presenter !== null && presenter.id == sessionId) {
    for (var i in viewers) {
      var viewer = viewers[i];
      if (viewer.ws) {
        viewer.ws.send(JSON.stringify({
          id: 'stopCommunication'
        }));
      }
    }
    presenter.pipeline.release();
    presenter = null;
    viewers = [];

  } else if (viewers[sessionId]) {
    viewers[sessionId].webRtcEndpoint.release();
    delete viewers[sessionId];
  }

  clearCandidatesQueue(sessionId);

  if (viewers.length < 1 && !presenter) {
    console.log('Closing kurento client');
    kurentoClient.close();
    kurentoClient = null;
  }
}

function onIceCandidate(sessionId, _candidate) {
  var candidate = kurento.getComplexType('IceCandidate')(_candidate);

  if (presenter && presenter.id === sessionId && presenter.webRtcEndpoint) {
    console.info('Sending presenter candidate');
    presenter.webRtcEndpoint.addIceCandidate(candidate);
  }
  else if (viewers[sessionId] && viewers[sessionId].webRtcEndpoint) {
    console.info('Sending viewer candidate');
    viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
  }
  else {
    console.info('Queueing candidate');
    if (!candidatesQueue[sessionId]) {
      candidatesQueue[sessionId] = [];
    }
    candidatesQueue[sessionId].push(candidate);
  }
}


/**
 * SocketIO implementation
 */
/*io.on('connection', socket => {
  socket.on('presenter', message => startPresenter(socket, JSON.parse(message).sdpOffer, (error, sdpAnswer) => {
    if (error) {
      return socket.emit('presenterResponse', JSON.stringify({
        response: 'rejected',
        message: error
      }));
    }
    socket.emit('presenterResponse', JSON.stringify({
      response: 'accepted',
      sdpAnswer: sdpAnswer
    }));
  }));
  socket.on('viewer', message => startViewer(socket, JSON.parse(message).sdpOffer, (error, sdpAnswer) => {
    if (error) {
      return socket.emit('viewerResponse', JSON.stringify({
        response: 'rejected',
        message: error
      }));
    }
    socket.emit('viewerResponse', JSON.stringify({
      response: 'accepted',
      sdpAnswer: sdpAnswer
    }));
  }));
  socket.on('stop', () => stop(socket));
  socket.on('onIceCandidate', message => onIceCandidate(socket, JSON.parse(message).candidate));
});

let kurentoClient = null;
let presenter = null;
let candidatesQueue = {};
let viewers = [];
let noPresenterMessage = 'No active presenter.';

let startPresenter = (socket, sdpOffer, callback) => {
  clearCandidatesQueue(socket);

  if (presenter !== null) {
    stop(socket);
    return callback(noPresenterMessage);
  }

  presenter = {
    id: socket.id,
    pipeline: null,
    webRtcEndpoint: null
  };

  getKurentoClient((error, kurentoClient) => {
    if (error) {
      stop(socket);
      return callback(error);
    }

    if (presenter === null) {
      stop(socket);
      return callback(noPresenterMessage);
    }

    kurentoClient.create('MediaPipeline', (error, pipeline) => {
      if (error) {
        stop(socket);
        return callback(noPresenterMessage);
      }

      if (presenter === null) {
        stop(socket);
        return callback(noPresenterMessage);
      }

      presenter.pipeline = pipeline;
      pipeline.create('WebRtcEndpoint', (error, webRtcEndpoint) => {
        if (error) {
          stop(socket);
          return callback(error);
        }

        if (presenter === null) {
          stop(socket);
          return callback(noPresenterMessage);
        }

        presenter.webRtcEndpoint = webRtcEndpoint;

        if (candidatesQueue[socket.id]) {
          while (candidatesQueue[socket.id].length) {
            let candidate = candidatesQueue[socket.id].shift();
            webRtcEndpoint.addIceCandidate(candidate);
          }
        }

        webRtcEndpoint.on('OnIceCandidate', event => {
          let candidate = kurento.getComplexType('IceCandidate')(event.candidate);
          socket.emit('iceCandidate', JSON.stringify({
            candidate: candidate
          }));
        });

        webRtcEndpoint.processOffer(sdpOffer, (error, sdpAnswer) => {
          if (error) {
            stop(socket);
            return callback(error);
          }

          if (presenter === null) {
            stop(socket);
            callback(noPresenterMessage);
          }

          callback(null, sdpAnswer);
        });

        webRtcEndpoint.gatherCandidates(error => {
          if (error) {
            stop(socket);
            return callback(error);
          }
        });
      });
    });
  });
};

let startViewer = (socket, sdpOffer, callback) => {
  clearCandidatesQueue(socket);

  if (presenter === null) {
    stop(socket);
    return callback(noPresenterMessage);
  }

  presenter.pipeline.create('WebRtcEndpoint', (error, webRtcEndpoint) => {
    if (error) {
      stop(socket);
      return callback(error);
    }

    viewers[socket.id] = {
      webRtcEndpoint: webRtcEndpoint,
      ws: socket
    };

    if (presenter === null) {
      stop(socket);
      return callback(noPresenterMessage);
    }

    if (candidatesQueue[socket.id]) {
      while (candidatesQueue[socket.id].length) {
        let candidate = candidatesQueue[socket.id].shift();
        webRtcEndpoint.addIceCandidate(candidate);
      }
    }

    webRtcEndpoint.on('OnIceCandidate', event => {
      let candidate = kurento.getComplexType('IceCandidate')(event.candidate);
      socket.emit('iceCandidate', JSON.stringify({
        candidate: candidate
      }));
    });

    webRtcEndpoint.processOffer(sdpOffer, (error, sdpAnswer) => {
      if (error) {
        stop(socket);
        return callback(error);
      }

      if (presenter === null) {
        stop(socket.id);
        return callback(noPresenterMessage);
      }

      callback(null, sdpAnswer);
      webRtcEndpoint.gatherCandidates(error => {
        if (error) {
          stop(socket);
          return callback(error);
        }
      })
    });
  });
};

let stop = (socket) => {
  if (presenter !== null && presenter.id === socket.id) {
    for (let i in viewers) {
      let viewer = viewers[i];
      if (viewer.ws) {
        viewer.ws.emit('stopCommunication');
      }
    }
    presenter.pipeline.release();
    presenter = null;
    viewers = [];
  }
  else if (viewers[socket.id]) {
    viewers[socket.id].webRtcEndpoint.release();
    delete viewers[socket.id];
  }

  clearCandidatesQueue(socket);

  if (viewers.length < 1 && !presenter) {
    console.log('Closing kurento client');
    kurentoClient.close();
    kurentoClient = null;
  }
};

let onIceCandidate = (socket, _candidate) => {
  let candidate = kurento.getComplexType('IceCandidate')(_candidate);

  if (!presenter && presenter.id === socket.id && presenter.webRtcEndpoint) {
    console.log('Sending presenter candidate');
    presenter.webRtcEndpoint.addIceCandidate(candidate);
  }
  else if (viewers[socket.id] && viewers[socket.id].webRtcEndpoint) {
    console.log('Sending viewer candidate');
    viewers[socket.id].webRtcEndpoint.addIceCandidate(candidate);
  }
  else {
    console.log('Queueing candidate');
    if (!candidatesQueue[socket.id]) {
      candidatesQueue[socket.id] = [];
    }
    candidatesQueue[socket.id].push(candidate);
  }
};

let getKurentoClient = callback => {
  if (kurentoClient !== null) {
    return callback(null, kurentoClient);
  }

  kurento("Your kurento server here", (error, _kurentoClient) => {
    if (error) {
      console.log('Could not find media server at provided address.');
      return callback('Could not find media server at provided address. ' + error);
    }

    kurentoClient = _kurentoClient;
    callback(null, kurentoClient);
  });
};

let clearCandidatesQueue = (socket) => {
  if (candidatesQueue[socket.id]) {
    delete candidatesQueue[socket.id];
  }
};*/

https.listen(process.env.PORT || 3000, function () {
  console.log('app listening at https://localhost:3000');
});

