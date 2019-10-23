import React from 'react';
import {Route, Switch} from 'react-router-dom';
import Presenter from '../Presenter';
import Viewer from '../Viewer';

let RouteProvider = props => {
  return(
    <Switch>
      <Route exact path='/presenter' component={Presenter}/>
      <Route exact path='/viewer' component={Viewer}/>
    </Switch>
  );
};

export default RouteProvider;