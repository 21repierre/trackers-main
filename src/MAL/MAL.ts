import {
    ContentRating,
    Form,
    MangaStatus,
    PagedResults,
    Request,
    Response,
    SearchRequest,
    Section,
    SourceInfo,
    TrackedManga,
    Tracker,
    TrackerActionQueue
} from 'paperback-extensions-common'
import {MalUser} from "./models/mal-user";
import {Manga, ResultInfo} from "./models/mal-resultpage";

export const MALInfo: SourceInfo = {
    name: 'MyAnimeList',
    author: 'repierre',
    contentRating: ContentRating.EVERYONE,
    icon: 'icon.png',
    version: '1.0.0',
    description: 'MyAnimeList tracker',
    authorWebsite: '',
    websiteBaseURL: 'https://myanimelist.net/'
}


export class MAL extends Tracker {

    client_id = '579d51e3483a434f4c122089b86a097c';
    stateManager = createSourceStateManager({})
    refreshToken = {
        get: async (): Promise<string | undefined> => {
            // @ts-ignore
            return this.stateManager.keychain.retrieve('refresh_token')
        },
        set: async (token: string | undefined): Promise<void> => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            await this.stateManager.keychain.store('refresh_token', token)
        },
        isValid: async (): Promise<boolean> => {
            return (await this.refreshToken.get()) != null
        }
    }
    accessToken = {
        get: async (): Promise<string | undefined> => {
            // @ts-ignore
            return this.stateManager.keychain.retrieve('access_token')
        },
        set: async (token: string | undefined): Promise<void> => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            await this.stateManager.keychain.store('access_token', token)
            await this.userInfo.refresh()
        },
        isValid: async (): Promise<boolean> => {
            return (await this.accessToken.get()) != null
        }
    }
    readonly requestManager = createRequestManager({
        requestsPerSecond: 2,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const token = await this.accessToken.get();
                request.headers = {
                    ...(request.headers ?? {}),
                    ...(token != null ? {
                        'Authorization': `Bearer ${token}`
                    } : {})
                }
                return request;
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                if (response.status === 401) {
                    if (response.request.url === 'https://myanimelist.net/v1/oauth2/token') {
                        throw Error('Error, please login again to MAL')
                    } else if (await this.accessToken.isValid()) {
                        const refresh = this.refreshToken.get();
                        if (refresh != null) {
                            //refresh token
                            await this.requestManager.schedule(createRequestObject({
                                url: 'https://myanimelist.net/v1/oauth2/token',
                                method: 'POST',
                                data: 'client_id=' + this.client_id + '&grant_type=refresh_token&refresh_token=' + refresh,
                                headers: {
                                    'content-type': 'application/json',
                                }
                            }), 0)
                            return await this.requestManager.schedule(response.request, 0);
                        } else {
                            await this.accessToken.set(undefined);
                            await this.refreshToken.set(undefined);
                            throw Error("Error, please login again to MAL")
                        }
                    }
                }
                return response;
            }
        }
    });
    userInfo = {
        get: async (): Promise<MalUser | undefined> => {
            return this.stateManager.retrieve('userInfo')
        },
        isLoggedIn: async (): Promise<boolean> => {
            return (await this.userInfo.get()) != null
        },
        refresh: async (): Promise<void> => {
            const token = this.accessToken.get();
            if (token == null) {
                return this.stateManager.store('userInfo', undefined)
            }

            const response = await this.requestManager.schedule(createRequestObject({
                url: 'https://api.myanimelist.net/v2/users/@me?fields=id,name,picture,location',
                method: 'GET'
            }), 0);
            if (response.status >= 400) {
                throw Error("Error")
            }
            let data = JSON.parse(response.data);

            const user = {
                id: data.id,
                name: data.name,
                avatar: {
                    large: data.picture
                },
                location: data.location,
            }
            await this.stateManager.store('userInfo', user);

        }
    }

    // @ts-ignore
    getMangaForm(mangaId: string): Form {
        return createForm({
            sections: async () => {
                console.log("mangaform")
                if (!await this.userInfo.isLoggedIn()) {
                    return [
                        createSection({
                            id: 'notLoggedInSection',
                            rows: async () => [
                                createLabel({
                                    id: 'notLoggedIn',
                                    label: 'Not logged in',
                                    value: undefined
                                })
                            ]
                        })
                    ]
                }

                const responce = await this.requestManager.schedule(createRequestObject({
                    url: 'https://api.myanimelist.net/v2/manga/' + mangaId + '?fields=' + encodeURIComponent('id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_volumes,num_chapters,authors{first_name,last_name}'),
                    method: 'GET'
                }), 0)
                let data = JSON.parse(responce.data);
                console.log(JSON.stringify(data))
                let manga: Manga = data;


                console.log(typeof manga)
                //let manga_state = MangaStatus.UNKNOWN;


                return []
            },
            onSubmit: async (values) => {

            },
            validate: async (_values) => true
        });
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    async getSearchResults(query: SearchRequest, metadata: unknown): Promise<PagedResults> {
        const resultInfo = metadata as ResultInfo | undefined

        if (resultInfo?.hasNextPage === false) {
            return createPagedResults({results: [], metadata: resultInfo})
        }
        const nextPage = (resultInfo?.currentPage ?? 0) + 1

        const response = await this.requestManager.schedule(createRequestObject({
            url: 'https://api.myanimelist.net/v2/manga?q=' + encodeURIComponent(query.title ?? '') + '&limit=10&offset=' + (nextPage - 1) * 10,
            method: 'GET',
        }), 0);
        let data = JSON.parse(response.data)

        return createPagedResults({
            // @ts-ignore
            results: data.data.map(m => m.node).map((manga: Manga) => createMangaTile({
                id: manga.id.toString(),
                image: manga.main_picture != null ? manga.main_picture.medium : '',
                title: createIconText({
                    text: manga.title
                })
            })) ?? [],
            metadata: undefined
        })


    }

    async getSourceMenu(): Promise<Section> {
        return createSection({
            id: 'sourceMenu',
            header: 'Source Menu',
            rows: async () => {
                const loggedIn = await this.userInfo.isLoggedIn();

                if (loggedIn) {
                    return [
                        createLabel({
                            id: 'userInfo',
                            label: 'Logged in as',
                            value: (await this.userInfo.get())?.name ?? 'ERROR'
                        }),
                        createButton({
                            id: 'logout',
                            label: 'Logout',
                            value: undefined,
                            onTap: async () => {
                                await this.accessToken.set(undefined)
                            }
                        })
                    ]
                } else {
                    return [
                        createOAuthButton({
                            id: 'malLogin',
                            authorizeEndpoint: 'https://myanimelist.net/v1/oauth2/authorize',
                            clientId: this.client_id,
                            label: 'Login with MyAnimeList',
                            responseType: {
                                type: 'pkce',
                                tokenEndpoint: 'https://myanimelist.net/v1/oauth2/token',
                                pkceCodeLength: 64,
                                // @ts-ignore
                                pkceCodeMethod: 'plain',
                                // @ts-ignore
                                formEncodeGrant: true,
                            },
                            value: undefined,
                            successHandler: async (token, _refreshToken) => {
                                console.log(token);
                                console.log(_refreshToken)
                                await this.accessToken.set(token)
                                await this.refreshToken.set(_refreshToken);
                            }
                        })
                    ]
                }
            }
        });
    }

    async getTrackedManga(mangaId: string): Promise<TrackedManga> {
        console.log("AAAAAAAA: " + mangaId)
        console.log('https://api.myanimelist.net/v2/manga/' + mangaId + ('?fields=id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_volumes,num_chapters,authors{first_name,last_name}'))

        const responce = await this.requestManager.schedule(createRequestObject({
            url: 'https://api.myanimelist.net/v2/manga/' + mangaId + '?fields=' + encodeURIComponent('id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,num_list_users,num_scoring_users,nsfw,created_at,updated_at,media_type,status,genres,my_list_status,num_volumes,num_chapters,authors{first_name,last_name}'),
            method: 'GET'
        }), 0)
        let data = JSON.parse(responce.data);
        console.log(JSON.stringify(data))
        let manga: Manga = data;


        console.log(typeof manga)
        let manga_state = MangaStatus.UNKNOWN;

        // @ts-ignore
        return createTrackedManga({
            id: mangaId,
            mangaInfo: createMangaInfo({
                image: manga.main_picture?.medium ?? '',
                status: manga_state,
                titles: manga.alternative_titles?.synonyms ?? [],//?.concat([manga.alternative_titles?.en, manga.alternative_titles?.js]),
                artist: manga.authors[0]?.node.first_name ?? 'Unknown',
                author: manga.authors[0]?.node.first_name ?? 'Unknown',
                desc: manga.synopsis ?? '',
                hentai: manga.nsfw == 'black',
                rating: manga.mean ?? 0,
                // @ts-ignore
                banner: manga.main_picture?.medium ?? '',

            })
        })
    }

    async processActionQueue(actionQueue: TrackerActionQueue): Promise<void> {
        return Promise.resolve(undefined);
    }

}
