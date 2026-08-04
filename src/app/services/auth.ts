import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { LocalStorageService } from './local-storage.service';
import { AuthResponse, LoginOtpRequest, User, VerifyLoginOtpRequest } from '../models/admin.models';

@Injectable({
  providedIn: 'root',
})


export class AuthService {
  private readonly apiUrl = environment.apiUrl;
  private readonly mockUsers: User[] = [
    {
      id: 'user-001',
      name: 'Muhammad',
      email: 'shabiee@digisofttrsol.com',
      role: 'StoreAdmin',
      stores: [
        { id: 'store-001', name: 'Fashion Hub' },
        { id: 'store-002', name: 'TechZone' }
      ]
    }
  ];

  constructor(
    private http: HttpClient, private storage: LocalStorageService
  ) {

  }



  // mock storage start
  checkUser(email: string): User | null {
    const user = this.mockUsers.find(
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

  mockLogin(email: string): User | null {
    const user = this.checkUser(email);
    if (!user) {
      return null;
    }

    this.storage.setItem('currentUser', user);
    return user;
  }

  getCurrentUser(): User | null {
    return this.storage.getItem<User>('currentUser');
  }

  logout(): void {
    this.storage.removeItem('currentUser');
  }

  isLoggedIn(): boolean {
    return !!this.getCurrentUser();
  }
  //  mock storage close

  register(userData: Record<string, unknown>): Observable<unknown> {

    return this.http.post(
      `${this.apiUrl}/api/Auth/register`,
      userData
    );

  }

  requestOtp(request: LoginOtpRequest): Observable<AuthResponse> {

    return this.http.post<AuthResponse>(

      `${this.apiUrl}/api/Auth/request-login-otp`,

      request

    );

  }


  verifyLoginOtp(request: VerifyLoginOtpRequest): Observable<AuthResponse> {

    return this.http.post<AuthResponse>(
      `${this.apiUrl}/api/Auth/verify-login-otp`,
      request
    );

  }


  saveUser(user: User): void {

    this.storage.setItem(
      "currentUser",
      user
    );

  }


}
