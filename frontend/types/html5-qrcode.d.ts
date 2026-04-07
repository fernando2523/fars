declare module "html5-qrcode" {
    export enum Html5QrcodeSupportedFormats {
        QR_CODE = 0,
        AZTEC = 1,
        CODABAR = 2,
        CODE_39 = 3,
        CODE_93 = 4,
        CODE_128 = 5,
        DATA_MATRIX = 6,
        MAXICODE = 7,
        ITF = 8,
        EAN_13 = 9,
        EAN_8 = 10,
        PDF_417 = 11,
        RSS_14 = 12,
        RSS_EXPANDED = 13,
        UPC_A = 14,
        UPC_E = 15,
        UPC_EAN_EXTENSION = 16,
    }

    export interface Html5QrcodeConfigs {
        fps?: number;
        qrbox?: { width: number; height: number } | number;
        formatsToSupport?: Html5QrcodeSupportedFormats[];
        experimentalFeatures?: { useBarCodeDetectorIfSupported?: boolean };
    }

    export type QrcodeSuccessCallback = (decodedText: string, result: any) => void;
    export type QrcodeErrorCallback = (errorMessage: string, error: any) => void;

    export class Html5Qrcode {
        constructor(elementId: string, config?: any);
        start(
            cameraIdOrConfig: { facingMode: string } | string,
            configuration: Html5QrcodeConfigs,
            qrCodeSuccessCallback: QrcodeSuccessCallback,
            qrCodeErrorCallback?: QrcodeErrorCallback | undefined
        ): Promise<void>;
        stop(): Promise<void>;
        clear(): void;
    }
}
