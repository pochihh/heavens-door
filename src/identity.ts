declare const __HEAVENS_TEST__:boolean;
export const TEST_BUILD=typeof __HEAVENS_TEST__!=='undefined'&&__HEAVENS_TEST__;
export const APP_NAME=TEST_BUILD?"Heaven's Door Test":"Heaven's Door";
