declare class AlpacaCORS {
    constructor(config: any);
    keyId: any;
    secretKey: any;
    baseUrl: any;
    httpRequest(method: any, args: any, body?: undefined): any;
    dataHttpRequest(method: any, args: any, body?: undefined): any;
    argsFormatter(type: any, path: any, query: any): any;
    getAccount(): any;
    createOrder(body: any): any;
    getOrders(query?: undefined): any;
    getOrder(path: any): any;
    getOrderByClientId(query: any): any;
    cancelOrder(path: any): any;
    getPosition(path: any): any;
    getPositions(): any;
    getAssets(query?: undefined): any;
    getAsset(path: any): any;
    getCalendar(query?: undefined): any;
    getClock(): any;
    getBars(path: any, query1: any, query2?: undefined): any;
}
