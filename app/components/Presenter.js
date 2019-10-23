import React from 'react';
import kurentoUtils from 'kurento-utils';
import io from 'socket.io-client';

export default class Presenter extends React.Component {
  constructor(props) {
    super(props);

    this.videoRef = React.createRef();

    this.state = {
      presenting: false
    };

    this.webRtcPeer = null;
    this.socket = new WebSocket('wss://' + location.host + '/one2many');
    this.socket.onmessage = _message => {
      let message = JSON.parse(_message.data);
      console.log('Received message: ' + _message.data);

      switch (message.id) {
        case 'presenterResponse':
          this.presenterResponse(message);
          break;
        case 'stopCommunication':
          this.dispose();
          break;
        case 'iceCandidate':
          this.webRtcPeer.addIceCandidate(message.candidate)
          break;
        default:
          console.error('Unrecognized message', message);
      }
    };

    /**
     * SocketIO implementation
     */
    /*this.webRtcPeer = null;
    this.socket = io({transports: ['websocket']});
    this.socket.on('presenterResponse', message => this.presenterResponse(JSON.parse(message)));
    this.socket.on('stopCommunication', () => this.dispose());
    this.socket.on('iceCandidate', message => this.webRtcPeer.addIceCandidate(JSON.parse(message).candidate));

    this.presenter = this.presenter.bind(this);
    this.onOfferPresenter = this.onOfferPresenter.bind(this);
    this.presenterResponse = this.presenterResponse.bind(this);
    this.onIceCandidate = this.onIceCandidate.bind(this);
    this.dispose = this.dispose.bind(this);
    this.stop = this.stop.bind(this);*/

    this.presenter = this.presenter.bind(this);
    this.onOfferPresenter = this.onOfferPresenter.bind(this);
    this.presenterResponse = this.presenterResponse.bind(this);
    this.onIceCandidate = this.onIceCandidate.bind(this);
    this.dispose = this.dispose.bind(this);
    this.stop = this.stop.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
  }

  presenterResponse(message) {
    if (message.response !== 'accepted') {
      let errorMsg = message.message ? message.message : 'Unknown error';
      console.log('Call not accepted for the following reason: ' + errorMsg);
      this.dispose();
    } else {
      this.webRtcPeer.processAnswer(message.sdpAnswer);
    }
  }

  presenter() {
    let self = this;
    if (!this.webRtcPeer) {

      let options = {
        localVideo: this.videoRef.current,
        onicecandidate: this.onIceCandidate,
      };

      this.setState({
        presenting: true
      });

      this.webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error){
        if(error) return console.log(error);

        this.generateOffer(self.onOfferPresenter);
      });
    }
  }

  onOfferPresenter(error, offerSdp) {
    if (error) return console.log(error);

    let message = {
      id : 'presenter',
      sdpOffer : offerSdp
    };
    this.sendMessage(message);
  }

  onIceCandidate(candidate) {
    console.log('Local candidate ' + JSON.stringify(candidate));

    let message = {
      id : 'onIceCandidate',
      candidate : candidate
    };

    this.sendMessage(message);
  }

  stop() {
    if (this.webRtcPeer) {
      let message = {
        id : 'stop'
      };
      this.sendMessage(message);
      this.dispose();
    }
  }

  dispose() {
    if (this.webRtcPeer) {
      this.webRtcPeer.dispose();
      this.webRtcPeer = null;
      this.setState({
        presenting: false
      });
    }
  }

  sendMessage(message) {
    let jsonMessage = JSON.stringify(message);
    console.log('Senging message: ' + jsonMessage);
    this.socket.send(jsonMessage);
  }


  /**
   * SocketIO implementation
   */
  /*presenter() {
    let self = this;
    if (!this.webRtcPeer) {

      let options = {
        localVideo: this.videoRef.current,
        onicecandidate: this.onIceCandidate
      };

      this.webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, error => {
        if (error) return console.log(error);

        this.setState({
          presenting: true
        });

        this.generateOffer(self.onOfferPresenter);
      });
    }
  }

  onOfferPresenter(error, offerSdp) {
    if (error) return console.log(error);

    this.socket.emit('presenter', JSON.stringify({sdpOffer: offerSdp}));
  }


  presenterResponse(message) {
    if (message.response !== 'accepted') {
      console.log('Call not accepted for the following reason: ' + message.message);
      this.dispose();
    }
    else {
      this.webRtcPeer.processAnswer(message.sdpAnswer);
    }
  }

  onIceCandidate(candidate) {
    console.log('Local candidate ' + JSON.stringify(candidate));

    this.socket.emit('onIceCandidate', JSON.stringify({candidate: candidate}));
  }

  dispose() {
    if (this.webRtcPeer) {
      this.webRtcPeer.dispose();
      this.webRtcPeer = null;
      this.setState({
        presenting: false
      });
    }
  }

  stop() {
    if (this.webRtcPeer) {
      this.socket.emit('stop');
      this.dispose();
    }
  }*/

  render() {
    return (
      <div style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{padding: '10px'}}>
          Presenter
        </div>
        <video ref={this.videoRef} autoPlay playsInline style={{background: '#c5c5c5'}}/>
        <div style={{
          margin: '10px',
          padding: '8px 5px',
          background: 'rgba(81, 93, 255)',
          color: '#ffffff',
          cursor: 'pointer'
        }} onClick={this.state.presenting ? this.stop : this.presenter}>
          {this.state.presenting ? 'Stop' : 'Start'}
        </div>
      </div>
    )
  }
};