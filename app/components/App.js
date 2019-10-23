import React from 'react';
import {BrowserRouter as Router} from "react-router-dom";
import RouteProvider from "./router/RouteProvider";

let App = props => {
  return(
    <div id='router-div' style={{height: '100%', width: '100%'}}>
      <Router>
        <RouteProvider/>
      </Router>
    </div>
  );
};

export default App;