import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LocationState {
  name: string;
  code: string;
}

export interface LocationCountry {
  name: string;
  iso3: string;
  states: LocationState[];
}

interface CountriesNowState {
  name: string;
  state_code?: string;
}

interface CountriesNowCountry {
  name: string;
  iso3?: string;
  states?: CountriesNowState[];
}

interface CountriesNowResponse<T> {
  error: boolean;
  msg: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.locationApiUrl.replace(/\/$/, '');
  private countriesRequest?: Observable<LocationCountry[]>;
  private readonly cityRequests = new Map<string, Observable<string[]>>();

  getCountries(): Observable<LocationCountry[]> {
    if (!this.countriesRequest) {
      this.countriesRequest = this.http
        .get<CountriesNowResponse<CountriesNowCountry[]>>(`${this.apiUrl}/countries/states`)
        .pipe(
          map(response => {
            if (response.error || !Array.isArray(response.data)) throw new Error(response.msg || 'Countries could not be loaded.');
            return response.data
              .map(country => ({
                name: country.name,
                iso3: country.iso3 ?? '',
                states: (country.states ?? [])
                  .map(state => ({ name: state.name, code: state.state_code ?? '' }))
                  .sort((left, right) => left.name.localeCompare(right.name))
              }))
              .sort((left, right) => left.name.localeCompare(right.name));
          }),
          shareReplay({ bufferSize: 1, refCount: false })
        );
    }
    return this.countriesRequest;
  }

  getCities(country: string, state?: string): Observable<string[]> {
    const normalizedCountry = country.trim();
    const normalizedState = state?.trim() ?? '';
    const cacheKey = `${normalizedCountry.toLowerCase()}::${normalizedState.toLowerCase()}`;
    const cached = this.cityRequests.get(cacheKey);
    if (cached) return cached;

    const endpoint = normalizedState ? 'countries/state/cities/q' : 'countries/cities/q';
    let params = new HttpParams().set('country', normalizedCountry);
    if (normalizedState) params = params.set('state', normalizedState);

    const request = this.http
      .get<CountriesNowResponse<string[]>>(`${this.apiUrl}/${endpoint}`, { params })
      .pipe(
        map(response => {
          if (response.error || !Array.isArray(response.data)) throw new Error(response.msg || 'Cities could not be loaded.');
          return [...new Set(response.data.filter(Boolean))].sort((left, right) => left.localeCompare(right));
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    this.cityRequests.set(cacheKey, request);
    return request;
  }

  resetCountries(): void {
    this.countriesRequest = undefined;
  }
}
