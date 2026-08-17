import { Component, computed, input } from '@angular/core';

interface BarcodeBar {
  x: number;
  width: number;
}

const CODE_128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
] as const;

@Component({
  selector: 'app-barcode-display',
  templateUrl: './barcode-display.html',
  styleUrl: './barcode-display.css',
})
export class BarcodeDisplay {
  readonly value = input('');
  readonly size = input<'inline' | 'small' | 'medium'>('small');
  readonly normalizedValue = computed(() =>
    this.value()
      .replace(/[^\x20-\x7f]/g, '')
      .slice(0, 80),
  );
  readonly encoded = computed(() => this.encodeCode128(this.normalizedValue()));

  private encodeCode128(value: string): { bars: BarcodeBar[]; width: number } {
    if (!value) return { bars: [], width: 0 };
    const startCode = 104;
    const characterCodes = [...value].map((character) => character.charCodeAt(0) - 32);
    const checksum =
      (startCode + characterCodes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
    const patterns = [startCode, ...characterCodes, checksum, 106].map(
      (code) => CODE_128_PATTERNS[code],
    );
    const quietZone = 10;
    const bars: BarcodeBar[] = [];
    let x = quietZone;

    patterns.forEach((pattern) => {
      [...pattern].forEach((moduleWidth, index) => {
        const width = Number(moduleWidth);
        if (index % 2 === 0) bars.push({ x, width });
        x += width;
      });
    });

    return { bars, width: x + quietZone };
  }
}
