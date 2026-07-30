import { Component } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import Swal from 'sweetalert2';




function passwordValidator(
  control: AbstractControl
): ValidationErrors | null {


  const password = control.value;


  if (!password) {
    return null;
  }


  const hasUpperCase = /[A-Z]/.test(password);

  const hasLowerCase = /[a-z]/.test(password);

  const hasNumber = /[0-9]/.test(password);

  const hasSpecialCharacter =
    /[!@#$%^&*(),.?":{}|<>]/.test(password);



  const valid =
    password.length >= 8 &&
    hasUpperCase &&
    hasLowerCase &&
    hasNumber &&
    hasSpecialCharacter;



  return valid
    ? null
    : { passwordStrength: true };

}


function passwordMatchValidator(
  control: AbstractControl
): ValidationErrors | null {

  const password = control.get('password')?.value;

  const confirmPassword = control.get('confirmPassword')?.value;

  if (password === confirmPassword) {
    return null;
  }

  return {
    passwordMismatch: true
  };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {


  constructor(
    private auth: AuthService,
    private router: Router
  ) { }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  registerForm = new FormGroup({

    userName: new FormControl('', [Validators.required, Validators.minLength(4)]),
    email: new FormControl('', [
      Validators.required,
      Validators.pattern(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      )
    ]),
    password: new FormControl('', [Validators.required, passwordValidator]),

    confirmPassword: new FormControl('', [Validators.required])
  }, {
    validators: passwordMatchValidator
  });



  registerUser() {

    // Check Angular form validation first
    if (this.registerForm.invalid) {

      this.registerForm.markAllAsTouched();

      return;

    }


    // Call backend API
    this.auth.register(this.registerForm.value)
      .subscribe({

        // API success response (HTTP 200)
        next: (response: any) => {


          console.log("API RESPONSE:", response);



          Swal.fire({

            title: 'Success!',

            text: response.message,

            icon: 'success',

            confirmButtonColor: '#7C1C77'

          });



          // Clear form after successful registration
          this.registerForm.reset();


          // Remove validation states
          this.registerForm.markAsPristine();

          this.registerForm.markAsUntouched();



        },


        // API error response (HTTP 400, 500 etc.)
        error: (error) => {


          console.log("Registration failed:", error);



          Swal.fire({

            title: 'Registration Failed',

            text: error.error?.message || 'Something went wrong',

            icon: 'error',

            confirmButtonColor: '#7C1C77'

          });


        }


      });


  }






}
