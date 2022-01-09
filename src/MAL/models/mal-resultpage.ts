export interface Result {

    mangas: Manga[];
    resultInfo: ResultInfo;

}

export interface ResultInfo {

    currentPage: number;
    hasNextPage: boolean;
}

export interface Author {
    node: {
        id: number
        first_name: string
        last_name: string
    }
    role: string
}

interface ListStatus {
    status?: string
    score: number
    num_volumes_read: number
    num_chapters_read: number
    is_rereading: boolean
    start_date?: string
    finish_date?: string
    priority: number
    num_times_reread: number
    reread_value: number
    tags: string[]
    comments: string
    updated_at: string
}

interface Genre {
    id: number
    name: string
}

interface Title {
    synonyms?: string[]
    en?: string
    js?: string
}

export interface Manga {
    id: number;
    title: string;
    main_picture?: Picture
    alternative_titles?: Title
    start_date?: string
    end_date?: string
    synopsis?: string
    mean?: number
    rank?: number
    popularity?: number
    num_list_users?: number
    num_scoring_users?: number
    nsfw?: string
    genre: Genre[]
    created_at: string
    updated_at: string
    media_type: string
    status: string
    my_list_status: ListStatus
    num_volumes: number
    num_chapters: number
    authors: Author[]
}

export interface Picture {
    large?: string;
    medium: string;
}
