import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { LocalStorageService } from './local-storage.service';

@Injectable({
  providedIn: 'root',
})


export class AuthService {


  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,private storage: LocalStorageService
  ) {

  }



  // mock storage start

  mockLogin(email:string){


 const user = {

   id:1,
   name:"Muhammad",
   email:email,
   role:"StoreAdmin",

   stores:[
     {
       id:101,
       name:"Digital Store"
     }
   ]

 };


 this.storage.setItem(
   "currentUser",
   user
 );


 return user;

}




getCurrentUser(){

 return this.storage.getItem(
   "currentUser"
 );

}




logout(){

 this.storage.removeItem(
   "currentUser"
 );

}



isLoggedIn(){

 return !!this.getCurrentUser();

}
    //  mock storage close

  register(userData: any) {

    return this.http.post(
      `${this.apiUrl}/api/Auth/register`,
      userData
    );

  }

  requestOtp(request: any) {

    return this.http.post<any>(

      `${this.apiUrl}/api/Auth/request-login-otp`,

      request

    );

  }


  verifyLoginOtp(request: any) {

    return this.http.post<any>(
      `${this.apiUrl}/api/Auth/verify-login-otp`,
      request
    );

  }


  saveUser(user:any){

  this.storage.setItem(
    "currentUser",
    user
  );

}


}
