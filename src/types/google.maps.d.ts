declare global {
  namespace google.maps {
    class DirectionsService {
      route(request: DirectionsRequest): Promise<DirectionsResult>;
    }

    interface DirectionsRequest {
      origin: any;
      destination: any;
      travelMode: TravelMode;
    }

    interface DirectionsResult {
      routes: Array<{
        overview_polyline: string;
        legs: Array<{
          distance: { value: number };
          duration: { value: number };
        }>;
      }>;
    }

    enum TravelMode {
      DRIVING = 'DRIVING'
    }

    class ElevationService {
      getElevationForLocations(request: { locations: any[] }): Promise<ElevationResult>;
    }

    interface ElevationResult {
      results: Array<{
        elevation: number;
      }>;
    }

    namespace maps3d {
      class Map3DElement extends HTMLElement {
        constructor(options: Map3DOptions);
        append(element: any): void;
        removeChild(element: any): void;
        flyCameraTo(options: FlyCameraOptions): void;
      }

      class Marker3DElement extends HTMLElement {
        constructor(options: Marker3DOptions);
      }

      class Polyline3DElement extends HTMLElement {
        constructor(options: Polyline3DOptions);
      }

      enum AltitudeMode {
        RELATIVE_TO_GROUND = 'RELATIVE_TO_GROUND',
        ABSOLUTE = 'ABSOLUTE'
      }
    }

    interface Map3DOptions {
      center: {
        lat: number;
        lng: number;
        altitude: number;
      };
      tilt: number;
      mode: string;
    }

    interface Marker3DOptions {
      position: any;
      extruded?: boolean;
      label?: string;
      altitudeMode?: maps3d.AltitudeMode;
    }

    interface Polyline3DOptions {
      coordinates: Array<{ lat: number; lng: number }>;
      strokeColor: string;
      outerColor: string;
      strokeWidth: number;
      outerWidth: number;
      altitudeMode: maps3d.AltitudeMode;
      drawsOccludedSegments: boolean;
    }

    interface FlyCameraOptions {
      endCamera: {
        center: {
          lat: number;
          lng: number;
          altitude: number;
        };
        tilt: number;
        heading: number;
        range: number;
      };
      durationMillis: number;
    }

    namespace places {
      class PlaceAutocompleteElement extends HTMLElement {
        constructor();
      }
    }

    class PinElement {
      constructor(options: {
        background: string;
        glyph: URL;
      });
    }

    function importLibrary(name: string): Promise<any>;
  }

  interface Window {
    google: typeof google;
  }
}

export {}; 