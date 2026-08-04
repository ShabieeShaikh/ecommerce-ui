import { Component, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { AuthService } from '../../services/auth';
import { finalize } from 'rxjs';
import { Register } from '../register/register';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Register],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnDestroy {
  // Loading and flow state controls
  testMode = true;
  isLoading = false;
  otpSent = false;
  isRegisterMode = false;
  countdown = 0;
  private timerInterval: any;

  // Local storage for OTP inputs
  otpValues: string[] = ['', '', '', '', '', ''];

  // Email form configuration
  loginForm = new FormGroup({
    email: new FormControl('', [
      Validators.required,
      Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    ])
  });




  constructor(private router: Router, private auth: AuthService, private cdr: ChangeDetectorRef) {

    console.log("LOGIN COMPONENT LOADED");
  }

  /**
   * Mock Send OTP sequence
   */
  sendOtp() {

    console.log("sendOtp() called");
    if (this.loginForm.invalid) {

      this.loginForm.markAllAsTouched();

      return;

    }

    const email = this.loginForm.value.email || "";


const user = this.auth.checkUser(email);


if(!user){


 Swal.fire({

   title:"User Not Found",

   text:"This email is not registered.",

   icon:"error",

   confirmButtonColor:"#7C1C77"

 });


 return;

}


    // TEST MODE (No API call)
    if (this.testMode) {


      this.otpSent = true;

      this.startTimer();


      Swal.fire({

        title: 'Test OTP Sent!',
        text: 'Use OTP: 123456',
        icon: 'success',
        confirmButtonColor: '#7C3AED'

      });


      return;

    }



    // real api

    this.isLoading = true;


    const request = {

      email: this.loginForm.value.email || '',

      deviceId: "string",

      deviceName: "web",

      platform: "web",

      appVersion: "1.0.0"

    };



    this.auth.requestOtp(request).pipe(
      finalize(() => {

        this.isLoading = false;

      })
    ).subscribe({

      next: (response: any) => {

        console.log("API SUCCESS RESPONSE:", response);



        this.otpSent = true;

        this.startTimer();

        this.cdr.detectChanges();

        console.log("Loading:", this.isLoading);
        console.log("OTP Sent:", this.otpSent);

        Swal.fire({

          title: 'Success!',

          text: response.message || `A verification code has been sent to ${request.email}.`,

          icon: 'success',

          confirmButtonColor: '#7C3AED'

        });

      },


      error: (error: any) => {



        Swal.fire({

          title: 'Unable to Send OTP',

          text: error.error?.message || 'Something went wrong.',

          icon: 'error',

          confirmButtonColor: '#7C3AED'

        });


      }


    });

  }

  /**
   * Mock Verify OTP sequence
   */



  verifyOtp() {



    console.log("VERIFY FUNCTION STARTED");



    if (!this.isOtpComplete()) {

      console.log("OTP COMPLETE");

      return;
    }

    console.log("OTP COMPLETE");



    // TEST OTP MODE
    if (this.testMode) {


      console.log("ENTERED TEST MODE");

      const enteredOtp = this.otpValues.join('');

      console.log("ENTERED OTP:", enteredOtp);


      if (enteredOtp !== "123456") {


        console.log("WRONG OTP");

        Swal.fire({

          title: 'Invalid OTP',
          text: 'For testing use OTP: 123456',
          icon: 'error',
          confirmButtonColor: '#7C1C77'

        });


        return;

      }

      console.log("correct OTP");



      console.log("BEFORE MOCK LOGIN");

      const user = this.auth.mockLogin(
        this.loginForm.value.email || ''
      );

      console.log("AFTER MOCK LOGIN", user);


      Swal.fire({

        title: 'Login Success!',
        text: 'Redirecting to dashboard...',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false

      }).then(() => {


        this.router.navigate([
          '/store-admin/dashboard'
        ]);


      });


      return;

    }


    // real api

    this.isLoading = true;


    const request = {

      email: this.loginForm.value.email || '',

      otp: this.otpValues.join(''),

      deviceId: "string",

      deviceName: "web",

      platform: "web",

      appVersion: "1.0.0"

    };


    this.auth.verifyLoginOtp(request)
      .subscribe({

        next: (response: any) => {


          this.isLoading = false;


          console.log("Verify OTP Response:", response);



          if (response.success) {


            // Store Access Token
            sessionStorage.setItem(
              "accessToken",
              response.data.accessToken
            );


            // Store user information
            // sessionStorage.setItem(
            //   "user",
            //   JSON.stringify(response.data)
            // );

            this.auth.saveUser(
              response.data
            );



            Swal.fire({

              title: 'Login Success!',

              text: 'Redirecting to home...',

              icon: 'success',

              timer: 1500,

              showConfirmButton: false,

              confirmButtonColor: '#7C1C77'


            }).then(() => {


              this.router.navigate(['/store-admin/dashboard']);


            });



          } else {


            Swal.fire({

              title: 'Login Failed',

              text: response.message || 'Invalid OTP',

              icon: 'error',

              confirmButtonColor: '#7C1C77'

            });


          }


        },


        error: (error: any) => {


          this.isLoading = false;


          console.log("Verify OTP Error:", error);


          Swal.fire({

            title: 'Verification Failed',

            text:
              error.error?.message ||
              'Invalid OTP or server error',

            icon: 'error',

            confirmButtonColor: '#7C1C77'

          });


        }


      });


  }




  /**
   * Resend OTP sequence
   */
  // resendOtp() {
  //   this.isLoading = true;
  //   const email = this.loginForm.value.email || '';

  //   this.auth.requestOtp(email).subscribe({
  //     next: (response: any) => {
  //       this.isLoading = false;
  //       this.startTimer();

  //       Swal.fire({
  //         title: 'Code Resent',
  //         text: response.message || 'A fresh verification code was sent to your email.',
  //         icon: 'info',
  //         confirmButtonColor: '#7C1C77',
  //         toast: true,
  //         position: 'top-end',
  //         showConfirmButton: false,
  //         timer: 3000,
  //         timerProgressBar: true
  //       });
  //     },
  //     error: (error: any) => {
  //       this.isLoading = false;

  //       Swal.fire({
  //         title: 'Resend Failed',
  //         text: error.error?.message || 'Could not resend code. Please try again.',
  //         icon: 'error',
  //         confirmButtonColor: '#7C1C77'
  //       });
  //     }
  //   });
  // }

  /**
   * Third-party Google Login simulation
   */
  googleLogin() {
    Swal.fire({
      title: 'Google Sign In',
      text: 'Connecting to Google Authentication...',
      icon: 'info',
      showConfirmButton: false,
      timer: 1500,
      didOpen: () => {
        Swal.showLoading();
      }
    }).then(() => {
      Swal.fire({
        title: 'Authenticated',
        text: 'Google account linked successfully.',
        icon: 'success',
        confirmButtonColor: '#7C1C77'
      });
    });
  }

  /**
   * Navigate back to the email input page
   */
  goBackToEmail() {
    this.otpSent = false;
    this.otpValues = ['', '', '', '', '', ''];
    this.clearInterval();
  }

  /**
   * Navigate to Register component
   */
  goToRegister() {
    this.isRegisterMode = true;
  }

  showLogin() {
    this.isRegisterMode = false;
  }

  /**
   * Focus transition management for keyboard inputs in OTP digits
   */
  onOtpInput(event: any, index: number, prev: HTMLInputElement | null, next: HTMLInputElement | null) {
    const input = event.target as HTMLInputElement;
    const val = input.value;

    // Sanitize input to only hold a single numeric character
    if (val.length > 0) {
      const numericDigit = val.charAt(val.length - 1);
      if (/^[0-9]$/.test(numericDigit)) {
        input.value = numericDigit;
        this.otpValues[index - 1] = numericDigit;

        // Auto-focus next input if it exists
        if (next) {
          next.focus();
        }
      } else {
        input.value = '';
        this.otpValues[index - 1] = '';
      }
    } else {
      this.otpValues[index - 1] = '';
    }

    console.log("OTP ARRAY:", this.otpValues);
  }

  /**
   * Handle Backspace event specifically to shift focus backward
   */
  onOtpBackspace(event: any, index: number, prev: HTMLInputElement | null, next: HTMLInputElement | null) {
    this.otpValues[index - 1] = '';

    // Focus previous input if it exists
    if (prev) {
      setTimeout(() => {
        prev.focus();
      }, 0);
    }
  }

  /**
   * Handle pasting a 6-digit OTP code to fill all inputs automatically
   */
  onOtpPaste(event: any) {
    const clipboardData = event.clipboardData || (window as any).clipboardData;
    if (!clipboardData) return;

    const pastedData = clipboardData.getData('text').trim();
    if (/^[0-9]{6}$/.test(pastedData)) {
      event.preventDefault();

      // Update values in local array
      for (let i = 0; i < 6; i++) {
        this.otpValues[i] = pastedData.charAt(i);
      }

      // Shift focus to the last input box
      setTimeout(() => {
        const inputs = document.querySelectorAll('.otp-input');
        if (inputs && inputs.length === 6) {
          (inputs[5] as HTMLInputElement).focus();
        }
      }, 0);
    }
  }

  /**
   * Verify if all 6 digits of the OTP are entered
   */
  isOtpComplete(): boolean {
    return this.otpValues.every(val => val !== '' && /^[0-9]$/.test(val));
  }

  /**
   * Start resend cooldown timer
   */
  private startTimer() {
    this.clearInterval();
    this.countdown = 30;
    this.timerInterval = setInterval(() => {
      if (this.countdown > 0) {
        this.countdown--;
      } else {
        this.clearInterval();
      }
    }, 1000);
  }

  /**
   * Clean up background timers
   */
  private clearInterval() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  ngOnDestroy() {
    this.clearInterval();
  }
}
