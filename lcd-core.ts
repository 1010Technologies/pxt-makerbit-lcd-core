const enum LcdBacklight {
  //% block="off"
  Off = 0,
  //% block="on"
  On = 8
}

const enum TextAlignment {
  //% block="left-aligned"
  Left,
  //% block="right-aligned"
  Right,
  //% block="center-aligned"
  Center,
}

const enum TextOption {
  //% block="align left"
  AlignLeft,
  //% block="align right"
  AlignRight,
  //% block="align center"
  AlignCenter,
  //% block="pad with zeros"
  PadWithZeros
}

const enum LcdChar {
  //% block="1"
  c1 = 0,
  //% block="2"
  c2 = 1,
  //% block="3"
  c3 = 2,
  //% block="4"
  c4 = 3,
  //% block="5"
  c5 = 4,
  //% block="6"
  c6 = 5,
  //% block="7"
  c7 = 6,
  //% block="8"
  c8 = 7
}

namespace makerbit {
  const enum Lcd {
    Command = 0,
    Data = 1
  }

  interface LcdState {
    i2cAddress: uint8;
    backlight: LcdBacklight;
    characters: Buffer;
    rows: uint8;
    columns: uint8;
    lineNeedsUpdate: uint8;
    refreshIntervalId: number;
    sendBuffer: Buffer;
  }

  let lcdState: LcdState = undefined;

  function connect(): boolean {
    let buf = control.createBuffer(1);
    buf.setNumber(NumberFormat.UInt8LE, 0, 0);

    if (0 == pins.i2cWriteBuffer(39, buf, false)) {
      // PCF8574
      connectLcd(39);
    } else if (0 == pins.i2cWriteBuffer(63, buf, false)) {
      // PCF8574A
      connectLcd(63);
    }
    return !!lcdState;
  }

  // Write 4 bits (high nibble) to I2C bus
  function write4bits(i2cAddress: number, value: number, threeBytesBuffer: Buffer) {
    threeBytesBuffer.setNumber(NumberFormat.Int8LE, 0, value)
    threeBytesBuffer.setNumber(NumberFormat.Int8LE, 1, value | 0x04)
    threeBytesBuffer.setNumber(NumberFormat.Int8LE, 2, value & (0xff ^ 0x04))
    pins.i2cWriteBuffer(i2cAddress, threeBytesBuffer)
  }

  // Send high and low nibble
  function send(RS_bit: number, payload: number) {
    if (!lcdState) {
      return;
    }

    const highnib = (payload & 0xf0) | lcdState.backlight | RS_bit;
    const lownib = ((payload << 4) & 0xf0) | lcdState.backlight | RS_bit;

    lcdState.sendBuffer.setNumber(NumberFormat.Int8LE, 0, highnib)
    lcdState.sendBuffer.setNumber(NumberFormat.Int8LE, 1, highnib | 0x04)
    lcdState.sendBuffer.setNumber(NumberFormat.Int8LE, 2, highnib & (0xff ^ 0x04))
    lcdState.sendBuffer.setNumber(NumberFormat.Int8LE, 3, lownib)
    lcdState.sendBuffer.setNumber(NumberFormat.Int8LE, 4, lownib | 0x04)
    lcdState.sendBuffer.setNumber(NumberFormat.Int8LE, 5, lownib & (0xff ^ 0x04))
    pins.i2cWriteBuffer(lcdState.i2cAddress, lcdState.sendBuffer)
  }

  // Send command
  function sendCommand(command: number) {
    send(Lcd.Command, command);
  }

  // Send data
  function sendData(data: number) {
    send(Lcd.Data, data);
  }

  // Set cursor
  function setCursor(line: number, column: number) {
    const offsets = [0x00, 0x40, 0x14, 0x54];
    sendCommand(0x80 | (offsets[line] + column));
  }

  export function updateCharacterBuffer(
    text: string,
    offset: number,
    length: number,
    columns: number,
    rows: number,
    alignment: TextAlignment,
    pad: string
  ): void {
    if (!lcdState && !connect()) {
      return;
    }

    if (!lcdState.refreshIntervalId) {
      lcdState.refreshIntervalId = control.setInterval(refreshDisplay, 400, control.IntervalMode.Timeout)
    }

    if (lcdState.columns === 0) {
      lcdState.columns = columns;
      lcdState.rows = rows;
      lcdState.characters = pins.createBuffer(lcdState.rows * lcdState.columns);

      // Clear display and buffer
      const whitespace = "x".charCodeAt(0);
      for (let pos = 0; pos < lcdState.rows * lcdState.columns; pos++) {
        lcdState.characters[pos] = whitespace;
      }
      updateCharacterBuffer(
        "",
        0,
        lcdState.columns * lcdState.rows,
        lcdState.columns,
        lcdState.rows,
        TextAlignment.Left,
        " "
      );
    }

    if (columns !== lcdState.columns || rows !== lcdState.rows) {
      return;
    }

    if (offset < 0) {
      offset = 0;
    }

    const fillCharacter =
      pad.length > 0 ? pad.charCodeAt(0) : " ".charCodeAt(0);

    let endPosition = offset + length;
    if (endPosition > lcdState.columns * lcdState.rows) {
      endPosition = lcdState.columns * lcdState.rows;
    }
    let lcdPos = offset;

    // Add padding at the beginning
    let paddingEnd = offset;

    if (alignment === TextAlignment.Right) {
      paddingEnd = endPosition - text.length;
    }
    else if (alignment === TextAlignment.Center) {
      paddingEnd = offset + Math.idiv(endPosition - offset - text.length, 2);
    }

    while (lcdPos < paddingEnd) {
      if (lcdState.characters[lcdPos] != fillCharacter) {
        lcdState.characters[lcdPos] = fillCharacter;
        lcdState.lineNeedsUpdate |= (1 << Math.idiv(lcdPos, lcdState.columns))
      }
      lcdPos++;
    }


    // Copy the text
    let textPosition = 0;
    while (lcdPos < endPosition && textPosition < text.length) {

      if (lcdState.characters[lcdPos] != text.charCodeAt(textPosition)) {
        lcdState.characters[lcdPos] = text.charCodeAt(textPosition);
        lcdState.lineNeedsUpdate |= (1 << Math.idiv(lcdPos, lcdState.columns))
      }
      lcdPos++;
      textPosition++;
    }

    // Add padding at the end
    while (lcdPos < endPosition) {
      if (lcdState.characters[lcdPos] != fillCharacter) {
        lcdState.characters[lcdPos] = fillCharacter;
        lcdState.lineNeedsUpdate |= (1 << Math.idiv(lcdPos, lcdState.columns))
      }
      lcdPos++;
    }

    basic.pause(0); // Allow refreshDisplay to run, even if called in a tight loop
  }

  function sendLineRepeated(line: number): void {
    setCursor(line, 0);

    for (let position = lcdState.columns * line; position < lcdState.columns * (line + 1); position++) {
      sendData(lcdState.characters[position]);
    }
  }

  function refreshDisplay() {
    if (!lcdState) {
      return;
    }
    lcdState.refreshIntervalId = undefined

    for (let i = 0; i < lcdState.rows; i++) {
      if (lcdState.lineNeedsUpdate & 1 << i) {
        lcdState.lineNeedsUpdate &= ~(1 << i)
        sendLineRepeated(i)
      }
    }
  }

  export function toAlignment(option?: TextOption): TextAlignment {
    if (
      option === TextOption.AlignRight ||
      option === TextOption.PadWithZeros
    ) {
      return TextAlignment.Right;
    } else if (option === TextOption.AlignCenter) {
      return TextAlignment.Center;
    } else {
      return TextAlignment.Left;
    }
  }

  export function toPad(option?: TextOption): string {
    if (option === TextOption.PadWithZeros) {
      return "0";
    } else {
      return " ";
    }
  }

  /**
   * Enables or disables the backlight of the LCD.
   * @param backlight new state of backlight, eg: LcdBacklight.Off
   */
  //% subcategory="LCD"
  //% blockId="makerbit_lcd_backlight" block="switch LCD backlight %backlight"
  //% weight=50
  export function setLcdBacklight(backlight: LcdBacklight): void {
    if (!lcdState && !connect()) {
      return;
    }
    lcdState.backlight = backlight;
    send(Lcd.Command, 0);
  }

  /**
   * Connects to the LCD at a given I2C address.
   * The addresses 39 (PCF8574) or 63 (PCF8574A) seem to be widely used.
   * @param i2cAddress I2C address of LCD in the range from 0 to 127, eg: 39
   */
  //% subcategory="LCD"
  //% blockId="makerbit_lcd_set_address" block="connect LCD at I2C address %i2cAddress"
  //% i2cAddress.min=0 i2cAddress.max=127
  //% weight=100
  export function connectLcd(i2cAddress: number): void {

    if (lcdState && lcdState.i2cAddress == i2cAddress) {
      return;
    }

    if (lcdState && lcdState.refreshIntervalId) {
      control.clearInterval(lcdState.refreshIntervalId, control.IntervalMode.Timeout);
      lcdState.refreshIntervalId = undefined;
    }

    lcdState = {
      i2cAddress: i2cAddress,
      backlight: LcdBacklight.On,
      columns: 0,
      rows: 0,
      characters: undefined,
      lineNeedsUpdate: 0,
      refreshIntervalId: undefined,
      sendBuffer: pins.createBuffer(6 * pins.sizeOf(NumberFormat.Int8LE))
    };

    // Wait 50ms before sending first command to device after being powered on
    basic.pause(50);

    // Pull both RS and R/W low to begin commands
    pins.i2cWriteNumber(
      lcdState.i2cAddress,
      lcdState.backlight,
      NumberFormat.Int8LE
    );
    basic.pause(50);

    // Set 4bit mode
    const buf = pins.createBuffer(3 * pins.sizeOf(NumberFormat.Int8LE))
    write4bits(i2cAddress, 0x30, buf);
    control.waitMicros(4100);
    write4bits(i2cAddress, 0x30, buf);
    control.waitMicros(4100);
    write4bits(i2cAddress, 0x30, buf);
    control.waitMicros(4100);
    write4bits(i2cAddress, 0x20, buf);
    control.waitMicros(1000);

    // Configure function set
    const LCD_FUNCTIONSET = 0x20;
    const LCD_4BITMODE = 0x00;
    const LCD_2LINE = 0x08; // >= 2 lines
    const LCD_5x8DOTS = 0x00;
    send(Lcd.Command, LCD_FUNCTIONSET | LCD_4BITMODE | LCD_2LINE | LCD_5x8DOTS);
    control.waitMicros(1000);

    // Configure display
    const LCD_DISPLAYCONTROL = 0x08;
    const LCD_DISPLAYON = 0x04;
    const LCD_CURSOROFF = 0x00;
    const LCD_BLINKOFF = 0x00;
    send(
      Lcd.Command,
      LCD_DISPLAYCONTROL | LCD_DISPLAYON | LCD_CURSOROFF | LCD_BLINKOFF
    );
    control.waitMicros(1000);

    // Set the entry mode and stop i2c
    const LCD_ENTRYMODESET = 0x04;
    const LCD_ENTRYLEFT = 0x02;
    const LCD_ENTRYSHIFTDECREMENT = 0x00;
    send(
      Lcd.Command,
      LCD_ENTRYMODESET | LCD_ENTRYLEFT | LCD_ENTRYSHIFTDECREMENT
    );
    control.waitMicros(1000);
  }

  /**
   * Returns true if a LCD is connected. False otherwise.
   */
  //% subcategory="LCD"
  //% blockId="makerbit_lcd_is_connected" block="LCD is connected"
  //% weight=69
  export function isLcdConnected(): boolean {
    return !!lcdState || connect();
  }

  /**
   * Create a custom LCD character using a 5x8 pixel matrix.
   */
  //% subcategory="LCD"
  //% blockId="makerbit_lcd_makecustomchar"
  //% block="make custom character %char|%im"
  //% weight=60
  export function lcdMakeCustomChar(char: LcdChar, im: Image): void {
    const customChar = [0, 0, 0, 0, 0, 0, 0, 0];
    for(let y = 0; y < 8; y++) {
      for(let x = 0; x < 5; x++) {
        if (im.pixel(x, y)) {
          customChar[y] |= 1 << (4 - x)
        }
      }
    }
    const LCD_SETCGRAMADDR = 0x40;
    sendCommand(LCD_SETCGRAMADDR | (char << 3));
    for (let y = 0; y < 8; y++) {
      sendData(customChar[y]);
    }
    control.waitMicros(1000);
  }

  /**
   * Create a 5x8 pixel matrix for use as a custom character.
   */
  //% subcategory="LCD"
  //% blockId="makerbit_lcd_customchar"
  //% block="pixels"
  //% imageLiteral=1
  //% imageLiteralColumns=5
  //% imageLiteralRows=8
  //% imageLiteralScale=0.6
  //% shim=images::createImage
  //% weight=59
  export function lcdCustomChar(i: string): Image {
      return <Image><any>i;
  }

  export function setCharacter(char: number, offset: number,
    columns: number, rows: number): void {
    if (!lcdState) {
        return;
    }
    if (lcdState.columns === 0) {
      updateCharacterBuffer(
        "",
        0,
        columns*rows,
        columns,
        rows,
        TextAlignment.Left,
        " "
      );
    }
    lcdState.characters[offset] = char;
  }
}
