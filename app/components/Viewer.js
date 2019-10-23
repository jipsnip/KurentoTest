import React from 'react';
import kurentoUtils from 'kurento-utils';
import io from 'socket.io-client';

export default class Viewer extends React.Component {
  constructor(props) {
    super(props);

    this.videoRef = React.createRef();

    this.state = {
      viewing: false
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
    this.socket.on('viewerResponse', message => this.viewerResponse(JSON.parse(message)));
    this.socket.on('stopCommunication', () => this.dispose());
    this.socket.on('iceCandidate', message => this.webRtcPeer.addIceCandidate(JSON.parse(message).candidate));

    this.viewer = this.viewer.bind(this);
    this.onOfferViewer = this.onOfferViewer.bind(this);
    this.viewerResponse = this.viewerResponse.bind(this);
    this.onIceCandidate = this.onIceCandidate.bind(this);
    this.dispose = this.dispose.bind(this);
    this.stop = this.stop.bind(this);*/

    this.viewer = this.viewer.bind(this);
    this.onOfferViewer = this.onOfferViewer.bind(this);
    this.viewerResponse = this.viewerResponse.bind(this);
    this.onIceCandidate = this.onIceCandidate.bind(this);
    this.dispose = this.dispose.bind(this);
    this.stop = this.stop.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
  }

  viewerResponse(message) {
    if (message.response !== 'accepted') {
      let errorMsg = message.message ? message.message : 'Unknown error';
      console.log('Call not accepted for the following reason: ' + errorMsg);
      this.dispose();
    } else {
      this.webRtcPeer.processAnswer(message.sdpAnswer);
    }
  }

  viewer() {
    let self = this;
    if (!this.webRtcPeer) {

      let options = {
        remoteVideo: this.videoRef.current,
        onicecandidate : this.onIceCandidate
      };

      this.setState({
        viewing: true
      });

      this.webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
        if(error) return console.log(error);

        this.generateOffer(self.onOfferViewer);
      });
    }
  }

  onOfferViewer(error, offerSdp) {
    if (error) return console.log(error);

    let message = {
      id : 'viewer',
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
        viewing: false
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
 /* viewer(){
    let self = this;
    if(!this.webRtcPeer){
      let options = {
        remoteVideo: this.videoRef.current,
        onicecandidate: this.onIceCandidate
      };

      this.webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error){
        if(error) return console.log(error);

        this.generateOffer(self.onOfferViewer);
      });
    }
  }

  onOfferViewer(error, offerSdp){
    if(error) return console.log(error);

    let message = {
      sdpOffer: offerSdp
    };

    this.socket.emit('viewer', JSON.stringify(message));
  }

  viewerResponse(message){
    if(message.response !== 'accepted'){
      console.log('Call not accepted for the following reason: ' + message.message);
      this.dispose();
    }
    else{
      this.webRtcPeer.processAnswer(message.sdpAnswer);
    }
  }

  onIceCandidate(candidate){
    console.log('Local candidate ' + JSON.stringify(candidate));

    this.socket.emit('onIceCandidate', JSON.stringify({candidate: candidate}));
  }

  dispose(){
    if (this.webRtcPeer) {
      this.webRtcPeer.dispose();
      this.webRtcPeer = null;
      this.setState({
        viewing: false
      });
    }
  }

  stop(){
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
        alignItems: 'center',
        minWidth: '500px'
      }}>
        <div style={{padding: '10px'}}>
          Viewer
        </div>
        <video ref={this.videoRef} autoPlay playsInline style={{background: '#c5c5c5'}}/>
        <div style={{
          margin: '10px',
          padding: '8px 5px',
          background: 'rgba(81, 93, 255)',
          color: '#ffffff',
          cursor: 'pointer'
        }} onClick={this.state.viewing ? this.stop : this.viewer}>
          {this.state.viewing ? 'Stop' : 'Start'}
        </div>
      </div>
    )
  }
}