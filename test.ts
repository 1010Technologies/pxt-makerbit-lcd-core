/**
 * LCD tests
 */

makerbit.connectLcd(39);
makerbit.setLcdBacklight(LcdBacklight.On);
const isLcdConnected: boolean = makerbit.isLcdConnected();
