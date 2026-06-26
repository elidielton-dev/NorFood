type RoutePoint = {
  latitude: number;
  longitude: number;
};

function dedupePoints(points: RoutePoint[]) {
  return points.filter((point, index, list) => {
    if (index === 0) return true;
    const previous = list[index - 1];
    return previous.latitude !== point.latitude || previous.longitude !== point.longitude;
  });
}

function createInterpolatedPoint(start: RoutePoint, end: RoutePoint, ratio: number): RoutePoint {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * ratio,
    longitude: start.longitude + (end.longitude - start.longitude) * ratio,
  };
}

function interpolatePolyline(start: RoutePoint, end: RoutePoint, pivot: RoutePoint) {
  const segments = [start, pivot, end];
  const output: RoutePoint[] = [];

  segments.forEach((point, index) => {
    if (index === segments.length - 1) return;
    const next = segments[index + 1];
    for (let step = 0; step <= 14; step += 1) {
      const ratio = step / 14;
      output.push(createInterpolatedPoint(point, next, ratio));
    }
  });

  return output;
}

export async function fetchRoutePath(points: RoutePoint[]) {
  const filtered = dedupePoints(points);
  if (filtered.length < 2) return filtered;

  try {
    const coordinateList = filtered.map((point) => `${point.longitude},${point.latitude}`).join(";");
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordinateList}?overview=full&geometries=geojson`,
    );

    if (response.ok) {
      const payload = (await response.json()) as {
        routes?: Array<{ geometry?: { coordinates?: number[][] } }>;
      };
      const coordinates = payload.routes?.[0]?.geometry?.coordinates ?? [];
      if (coordinates.length) {
        return coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
      }
    }
  } catch {
    // Fallback below keeps the map responsive even without external routing.
  }

  return interpolatePolyline(filtered[0], filtered.at(-1) ?? filtered[0], filtered[Math.floor(filtered.length / 2)]);
}
