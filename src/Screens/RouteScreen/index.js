import React, { Component } from "react";
import { View, Image, TouchableOpacity, Text, PermissionsAndroid, ToastAndroid, Platform, ActivityIndicator,NativeModules} from "react-native";
import images from '../../assets/images/images'
import styles from "./styles";
import AppOverlay from '../../AppOverlay'
import Dialog, { DialogContent } from 'react-native-popup-dialog';
import RadioForm from 'react-native-simple-radio-button';
import { connect } from 'react-redux';
import color from '../../utils/color'
import { Actions} from 'react-native-router-flux';
import api from '../../utils/ApiServices.js';
import Helper from "../../utils/Helper";
import Geolocation from 'react-native-geolocation-service';
import {AsyncStorage} from 'react-native';
import { saveUser,getUserDetails } from '../../actions';
let current = 0;
// import KeepAwake from 'react-native-keep-awake';
let count = 0;
logout =  () => {
  api.logOut();
}

class RouteScreen extends Component {
  watchId = null;
  constructor(props){
    super(props);
    this.state = {
      modalVisible:false,
      showLoader:false,
      currentStatus:2,
      keepawake:false,
      status : [
        {label: 'verfügbar', value: 0},
        {label: 'verfügbar auf tour', value: 1 },
        {label: 'nicht verfügbar', value: 2 }
      ],
    }
  }
  componentWillMount(){
    this.setState({showLoader:true})
  }
  componentDidMount(){
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
    }
    this.getUserDetailsFromlocalStorage();

  }
  getUserDetailsFromlocalStorage = async () => {
    try {
      const value = await AsyncStorage.getItem('MyradkurierAppLoginkey');
      let obj = JSON.parse(value);
      if (obj) { 
        this.props.getUserDetails(obj.user_id, obj.token,()=>{
          this.setDetails();
          this.setState({showLoader:false})
        })
      } else {
        Actions.login();
      }
    } catch (error) {
      Actions.login();
    }
  };
 
  static navigationOptions = {
    title: 'Home',
    headerStyle: {
      backgroundColor: color.select.primary,
      paddingBottom:20,
    },
    headerTintColor: '#fff',
    headerTitle: (
      <Image style={styles.logo} source={images.theme1.miniLogo} />
    ),
    headerRight: (
      <TouchableOpacity
       onPress={()=>{logout()}}>
        <Image style={styles.lgButton} source={images.theme1.logout} />
     </TouchableOpacity>
    ),
    headerLeft: (
      <Text style={{width:'20%'}} />
    ),
  };
  setDetails(){
    let details =  this.props.userDetails;
    this.setState({
      token:details.token,
      userId:details.user_id,
      currentStatus:Number(details.currentStatus),
      trackingId:details.trackingId,
    });
  }
  componentWillReceiveProps(nextProps){
    let details = nextProps.userDetails;
    this.setState({
      token:details.token,
      userId:details.user_id,
      currentStatus:Number(details.currentStatus!=''?details.currentStatus:2),
      trackingId:details.trackingId,
    })
  }
  toggleModal() {
    this.setState({ modalVisible: true });
  }
  hasLocationPermission = async () => {
    if (Platform.OS === 'ios' ||
        (Platform.OS === 'android' && Platform.Version < 23)) {
      return true;
    }

    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    if (hasPermission) return true;

    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    if (status === PermissionsAndroid.RESULTS.GRANTED) return true;

    if (status === PermissionsAndroid.RESULTS.DENIED) {
      ToastAndroid.show('Location permission denied by user.', ToastAndroid.LONG);
    } else if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      ToastAndroid.show('Location permission revoked by user.', ToastAndroid.LONG);
    }

    return false;
  }
  getLocation = async (status) => {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
    }
    const hasLocationPermission = await this.hasLocationPermission();
    if (!hasLocationPermission){
      this.setState({modalVisible:false, showLoader:false});
      return;
    }
    this.setState({
      currentStatus:status},()=>{
      if (this.watchId !== null) {
        Geolocation.clearWatch(this.watchId);
      }
      this.getLocationUpdates(status)
    })
  }
  getLocationUpdates = async (status) => {
    if(status == 2){
      if (this.watchId !== null) {
        Geolocation.clearWatch(this.watchId);
       }
      this.availableOrOnTour('' ,'', status, this.state.userId,true);
    } else {
      this.setState({keepawake:true},()=>{
        // this.changeKeepAwake()
      })
        this.watchId = Geolocation.watchPosition(
           (position) => {
           this.availableOrOnTour(position.coords.longitude, position.coords.latitude, status, this.state.userId,false);
          },
          (error) => {
            this.setState({ location: error });
          },
          { enableHighAccuracy: true, distanceFilter: 0, interval: 5000, fastestInterval: 10000 }
        );
          this.setState({showLoader:false,})
    }
   
  }

  availableOrOnTour(longitude,latitude,currentStatus, id, del = false){
    let details = this.props.userDetails
    let body = {
      status:'publish',
      user_name:del ? undefined:details.user_nicename,
      user_phone:del ? undefined: details.phone,
      user_email:del ? undefined: details.user_email,
      user_status:currentStatus,
      user_longitude:longitude,
      user_latitude:latitude,
      user_image:del ? undefined: details.avatar
    }
    api.get(`wp-json/wp/v2/users${id?"/"+id :''}?context=edit`, `Bearer ${this.state.token || this.props.token}`)
    .then((res) => {
      if(res && res.status === 200){
        api.post(`wp-json/wp/v2/biker/${res.data.trackingId || ''}`, body, `Bearer ${this.state.token || this.props.token}`)
        .then((response) => {
          if(response.data && response.data.id) {
            this.updatingStatus(currentStatus, response.data.id)
          } 
        })
      .catch((error) => {
        this.setState({showLoader:false})
        // Helper.showTopErrorMessage('Something went wrong', 'danger');
      });
      }
  });
  }
  logout(){
    Actions.login();
  }
  updatingStatus(status = undefined, trackingId = undefined){
    let body = {
      currentStatus : status,
      trackingId:trackingId
    }
    api.post(`/wp-json/wp/v2/users/${this.state.userId}`, body, `Bearer ${this.state.token || this.props.token}`)
    .then((response) => {
      if(response.data  && response.status == 200){
        let _obj = {
          user_nicename : response.data.name,
          city :response.data.city,
          phone : response.data.phone,
          user_email :response.data.email,
          avatar:response.data.avatar_urls[96],
          user_id:response.data.id,
          currentStatus:response.data.currentStatus!=='' ? response.data.currentStatus : 2,
          trackingId:response.data.trackingId,
          token:this.state.token || this.props.token,
        }
        // callback(response.data.trackingId,);
        this.props.saveUser(_obj);
        this.setState({showLoader:false})
      } 
    })
    .catch((err) => {
      this.setState({showLoader:false})
      Helper.showTopErrorMessage(err, 'danger');
    })
  }
  changeKeepAwake = () =>{
    if(this.state.keepawake){
      this.state.keepawake = false;
      KeepAwake.activate();
    }else{
      this.state.keepawake = true;
      KeepAwake.deactivate();
    }
  }
  render() {
    let _status = this.state.status;
    let _currentStatus = this.state.currentStatus;
    return (
      <AppOverlay height>
        <Dialog
          visible={this.state.modalVisible && !this.state.showLoader}
          onTouchOutside={() => {
            this.setState({ modalVisible: false });
          }}>
            <DialogContent style={{padding:30}}>
              <RadioForm
                radio_props={this.state.status}
                initial={this.state.currentStatus}
                animation={true}
                onPress={(value) => {
                  this.setState({modalVisible:false,showLoader:true})
                  this.getLocation(value); 
                }}
              />
          </DialogContent>
        </Dialog>
        <Dialog
          visible={!this.state.modalVisible && this.state.showLoader}
          onTouchOutside={() => {
            this.setState({ modalVisible: false });
          }}>
            <DialogContent style={{padding:30}}>
              <ActivityIndicator size="large" />
              <Text>Please wait...</Text>
            </DialogContent>
        </Dialog>
        <Image
            accessibilityRole={'image'}
            style={styles.background}
            imageStyle={styles.logo}
            source={images.theme1.servicePageImage} />
          <View style={{flexDirection:'row',justifyContent:'space-around',margin:20,marginTop:100}}>
            <Text style={{position:'absolute',top:-50,textAlign:'center',left:0,right:0,fontWeight:'bold',color:color.primary }}>{_status[_currentStatus].label || 'nicht verfügbar'}</Text>
            <TouchableOpacity 
              onPress={()=>{this.toggleModal(true)}}
              style={styles.ctaContainer}>
              <Image style={styles.ctaImage} source={images.theme1.trackIcon}/>
              <Text style={{fontSize:12,paddingTop:10}}>Tracking Starten</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctaContainer}
              onPress={() => Actions.profile() } 
            >
              <Image style={styles.ctaImageBiker} source={images.theme1.bikerIcon}/>
              <Text style={{fontSize:12,paddingTop:10}}>Profil Bearbeiten</Text>
            </TouchableOpacity>
          </View>
        </AppOverlay>
    );
  }
}
const mapStateToProps = state => ({
  token: state.userDetails.token,
  userDetails:state.userDetails

});
export default connect(mapStateToProps, {saveUser,getUserDetails})(RouteScreen);
