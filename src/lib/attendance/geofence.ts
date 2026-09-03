type CoordinateValue =
  | number
  | string
  | {
      toString(): string;
    };

export type AttendanceLocationPoint = {
  id: string;
  name: string;

  latitude:
    CoordinateValue;

  longitude:
    CoordinateValue;

  radiusMeters: number;
};

function toRadians(
  value: number,
) {
  return (
    value *
    (Math.PI / 180)
  );
}

export function getDistanceMeters(
  latitude1: number,
  longitude1: number,

  latitude2: number,
  longitude2: number,
) {
  const earthRadiusMeters =
    6_371_000;

  const lat1 =
    toRadians(latitude1);

  const lat2 =
    toRadians(latitude2);

  const deltaLatitude =
    toRadians(
      latitude2 -
        latitude1,
    );

  const deltaLongitude =
    toRadians(
      longitude2 -
        longitude1,
    );

  const a =
    Math.sin(
      deltaLatitude / 2,
    ) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(
        deltaLongitude / 2,
      ) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    );

  return (
    earthRadiusMeters * c
  );
}

export function findNearestAttendanceLocation(
  latitude: number,
  longitude: number,
  locations:
    AttendanceLocationPoint[],
) {
  let nearest:
    | {
        id: string;
        name: string;
        radiusMeters: number;
        distanceMeters: number;
      }
    | null = null;

  for (const location of locations) {
    const officeLatitude =
      Number(
        location.latitude.toString(),
      );

    const officeLongitude =
      Number(
        location.longitude.toString(),
      );

    if (
      !Number.isFinite(
        officeLatitude,
      ) ||
      !Number.isFinite(
        officeLongitude,
      )
    ) {
      continue;
    }

    const distanceMeters =
      getDistanceMeters(
        latitude,
        longitude,

        officeLatitude,
        officeLongitude,
      );

    if (
      !nearest ||
      distanceMeters <
        nearest.distanceMeters
    ) {
      nearest = {
        id:
          location.id,

        name:
          location.name,

        radiusMeters:
          location.radiusMeters,

        distanceMeters,
      };
    }
  }

  return nearest;
}