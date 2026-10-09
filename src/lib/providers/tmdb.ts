import type { Film } from "@/lib/engine/types";
import { ProviderError, type MoviesProvider } from "./types";

// TMDB movie genre ids are stable; avoids an extra request.
const GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 53: "Thriller", 10752: "War", 37: "Western",
};

export class TmdbMovies implements MoviesProvider {
  constructor(private apiKey: string, private fetchFn: typeof fetch = fetch) {}

  async nowPlaying(region: string): Promise<Film[]> {
    const url = new URL("https://api.themoviedb.org/3/movie/now_playing");
    url.searchParams.set("region", region);
    url.searchParams.set("language", "en-IN");
    url.searchParams.set("page", "1");
    url.searchParams.set("api_key", this.apiKey);
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new ProviderError(`tmdb HTTP ${res.status}`);
    const body = (await res.json()) as {
      results?: { id: number; title: string; genre_ids: number[]; vote_average: number; poster_path: string | null }[];
    };
    return (body.results ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      genres: m.genre_ids.map((g) => GENRES[g]).filter(Boolean),
      rating: m.vote_average,
      posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
    }));
  }
}
