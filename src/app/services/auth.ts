import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})


export class AuthService {


  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient
  ) {

  }

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


}
