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
    private http: HttpClient, private storage: LocalStorageService
  ) {

  }



  // mock storage start
  checkUser(email: string) {

    const users = [
      {
        id: 1,
        name: "Muhammad",
        email: "shabiee@digisofttrsol.com",
        role: "StoreAdmin",

        stores: [
          {
            id: 101,
            name: "Digital Store"
          }
        ]
      }
    ];


    const user = users.find(
      x => x.email === email
    );


    return user || null;

  }


  // mockLogin(email: string) {


  //   const users = [
  //     {
  //       id: 1,
  //       name: "Muhammad",
  //       email: "shabiee@digisofttrsol.com",
  //       role: "StoreAdmin",

  //       stores: [
  //         {
  //           id: 101,
  //           name: "Digital Store"
  //         }
  //       ]
  //     }
  //   ];


  //   const user = users.find(
  //     x => x.email === email
  //   );



  //   if (!user) {

  //     return null;

  //   }



  //   this.storage.setItem(
  //     "currentUser",
  //     user
  //   );


  //   return user;

  // }

  mockLogin(email:string){

  const user = this.checkUser(email);


  if(!user){

    return null;

  }


  this.storage.setItem(
    "currentUser",
    user
  );


  return user;

}




  getCurrentUser() {

    return this.storage.getItem(
      "currentUser"
    );

  }




  logout() {

    this.storage.removeItem(
      "currentUser"
    );

  }



  isLoggedIn() {

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


  saveUser(user: any) {

    this.storage.setItem(
      "currentUser",
      user
    );

  }


}
