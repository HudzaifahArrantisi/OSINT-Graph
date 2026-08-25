// Username site list ported from Mr.Holmes (Lucksi/Mr.Holmes, GPL-3.0).
// Detection modes: STATUS = HTTP status, MESSAGE = not-found body text, REDIRECT = redirects to a known not-found URL.

export interface MrHolmesSite {
  name: string;
  url: string;
  mode: 'STATUS' | 'MESSAGE' | 'REDIRECT';
  notFoundText?: string;
  redirectTarget?: string;
  invalidChars: string[];
  tags: string[];
}

export const MR_HOLMES_SITES: MrHolmesSite[] = [
  {
    "name": "Instagram",
    "url": "https://instagram.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Social",
      "Photo",
      "Video",
      "Chatting"
    ]
  },
  {
    "name": "Threads",
    "url": "https://threads.net/@{}",
    "mode": "MESSAGE",
    "notFoundText": "<title>Threads</title>",
    "invalidChars": [],
    "tags": [
      "Social",
      "Photo",
      "Video",
      "Chatting"
    ]
  },
  {
    "name": "GitHub",
    "url": "https://github.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Programming",
      "OpenSource"
    ]
  },
  {
    "name": "Holopin",
    "url": "https://holopin.io/@{}",
    "mode": "MESSAGE",
    "notFoundText": "Not found",
    "invalidChars": [],
    "tags": [
      "Badge"
    ]
  },
  {
    "name": "YouTube",
    "url": "https://youtube.com/@{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Video",
      "Sharing",
      "Youtube"
    ]
  },
  {
    "name": "Facebook",
    "url": "https://facebook.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "You must log in to continue.",
    "invalidChars": [
      ".",
      "_"
    ],
    "tags": [
      "Social",
      "Chatting"
    ]
  },
  {
    "name": "Disqus",
    "url": "https://disqus.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Chatting"
    ]
  },
  {
    "name": "Pinterest",
    "url": "https://pinterest.com/{}",
    "mode": "REDIRECT",
    "redirectTarget": "https://pinterest.com/",
    "invalidChars": [],
    "tags": [
      "Image",
      "Social",
      "Photo"
    ]
  },
  {
    "name": "Passes",
    "url": "https://passes.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "{}},",
    "invalidChars": [],
    "tags": [
      "Image",
      "Social",
      "Photo"
    ]
  },
  {
    "name": "Imgur",
    "url": "https://imgur.com/user/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Image"
    ]
  },
  {
    "name": "MySpace",
    "url": "https://myspace.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Social",
      "Chatting"
    ]
  },
  {
    "name": "Tellonym",
    "url": "https://tellonym.me/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Questions",
      "Chatting"
    ]
  },
  {
    "name": "Twitch",
    "url": "https://twitch.tv/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Streaming",
      "Gaming",
      "Chatting"
    ]
  },
  {
    "name": "Wattpad",
    "url": "https://www.wattpad.com/user/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Writing",
      "Stories"
    ]
  },
  {
    "name": "FortniteTracker",
    "url": "https://fortnitetracker.com/profile/all/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Gaming",
      "Fortnite"
    ]
  },
  {
    "name": "HackTheBox",
    "url": "https://forum.hackthebox.eu/profile/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Hacking"
    ]
  },
  {
    "name": "MyAnimeList",
    "url": "https://myanimelist.net/profile/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Anime"
    ]
  },
  {
    "name": "Oracle",
    "url": "https://community.oracle.com/people/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Forum-Programming"
    ]
  },
  {
    "name": "SoundCloud",
    "url": "https://soundcloud.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Music"
    ]
  },
  {
    "name": "Vimeo",
    "url": "https://vimeo.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "Sorry, we couldn’t find that page",
    "invalidChars": [],
    "tags": [
      "Video"
    ]
  },
  {
    "name": "Youpic",
    "url": "https://youpic.com/photographer/{}/",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Image",
      "Photo"
    ]
  },
  {
    "name": "Gfycat",
    "url": "https://gfycat.com/@{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Gyf"
    ]
  },
  {
    "name": "Flickr",
    "url": "https://www.flickr.com/photos/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Image",
      "Photo"
    ]
  },
  {
    "name": "DeviantArt",
    "url": "https://www.deviantart.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Art",
      "Photo"
    ]
  },
  {
    "name": "VKontakte",
    "url": "https://vk.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Social",
      "Chatting"
    ]
  },
  {
    "name": "9GAG",
    "url": "https://9gag.com/u/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Meme"
    ]
  },
  {
    "name": "Dailymotion",
    "url": "https://www.dailymotion.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Video"
    ]
  },
  {
    "name": "Tumblr",
    "url": "https://{}.tumblr.com/",
    "mode": "STATUS",
    "invalidChars": [
      "."
    ],
    "tags": [
      "Blog",
      "Social"
    ]
  },
  {
    "name": "SourceForge",
    "url": "https://sourceforge.net/u/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Programming"
    ]
  },
  {
    "name": "PyPi",
    "url": "https://pypi.org/user/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Programming",
      "OpenSource",
      "Python"
    ]
  },
  {
    "name": "GooglePlay",
    "url": "https://play.google.com/store/apps/developer?id={}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Store",
      "Gaming",
      "Programming"
    ]
  },
  {
    "name": "About.Me",
    "url": "https://about.me/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Blog"
    ]
  },
  {
    "name": "Pokemon Showdown",
    "url": "https://pokemonshowdown.com/users/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Gaming",
      "Pokemon"
    ]
  },
  {
    "name": "LolProfiles",
    "url": "https://lolprofile.net/search/world/{}",
    "mode": "MESSAGE",
    "notFoundText": "We could not find any results, please try again later or check your input.",
    "invalidChars": [],
    "tags": [
      "Gaming",
      "LoL"
    ]
  },
  {
    "name": "Twitter",
    "url": "https://mobile.twitter.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "not found",
    "invalidChars": [],
    "tags": [
      "Social",
      "Chatting"
    ]
  },
  {
    "name": "PsnProfiles",
    "url": "https://psnprofiles.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "Update User",
    "invalidChars": [],
    "tags": [
      "Gaming",
      "PlayStation"
    ]
  },
  {
    "name": "7Cups",
    "url": "https://www.7cups.com/@{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Image"
    ]
  },
  {
    "name": "AskFM",
    "url": "https://ask.fm/{}",
    "mode": "MESSAGE",
    "notFoundText": "Well, apparently not anymore.",
    "invalidChars": [
      "."
    ],
    "tags": [
      "Questions"
    ]
  },
  {
    "name": "TwitchTracker",
    "url": "https://twitchtracker.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Streaming",
      "Gaming",
      "Chatting"
    ]
  },
  {
    "name": "LinkTree",
    "url": "https://linktr.ee/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Link"
    ]
  },
  {
    "name": "Patreon",
    "url": "https://patreon.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Donations"
    ]
  },
  {
    "name": "Flipboard",
    "url": "https://flipboard.com/@{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Image",
      "Blog",
      "Article"
    ]
  },
  {
    "name": "BuyMeACoffee",
    "url": "https://www.buymeacoffee.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Donations"
    ]
  },
  {
    "name": "Interpals",
    "url": "https://www.interpals.net/{}",
    "mode": "MESSAGE",
    "notFoundText": "The requested user does not exist or is inactive",
    "invalidChars": [],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "TryHackMe",
    "url": "https://tryhackme.com/p/{}",
    "mode": "REDIRECT",
    "redirectTarget": "https://tryhackme.com/r/not-found",
    "invalidChars": [],
    "tags": [
      "Hacking"
    ]
  },
  {
    "name": "SteamCommunity",
    "url": "https://steamcommunity.com/id/{}",
    "mode": "MESSAGE",
    "notFoundText": "The specified profile could not be found.",
    "invalidChars": [],
    "tags": [
      "Gaming, Steam"
    ]
  },
  {
    "name": "BitcoinForum",
    "url": "https://bitcoinforum.com/profile/{}",
    "mode": "MESSAGE",
    "notFoundText": "The user whose profile you are trying to view does not exist.",
    "invalidChars": [],
    "tags": [
      "BitCoin-Forum",
      "BitCoin"
    ]
  },
  {
    "name": "BitBucket",
    "url": "https://bitbucket.org/{}/",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Programming",
      "OpenSource"
    ]
  },
  {
    "name": "ClubHouse",
    "url": "https://joinclubhouse.com/@{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "Bandcamp",
    "url": "https://www.bandcamp.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Image"
    ]
  },
  {
    "name": "Bookcrossing",
    "url": "https://www.bookcrossing.com/mybookshelf/{}/",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Books"
    ]
  },
  {
    "name": "Chess.com",
    "url": "https://www.chess.com/member/{}",
    "mode": "MESSAGE",
    "notFoundText": "not found",
    "invalidChars": [],
    "tags": [
      "Chess",
      "Chess.com"
    ]
  },
  {
    "name": "Fandom",
    "url": "https://www.fandom.com/u/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Social",
      "Forum"
    ]
  },
  {
    "name": "Freesound",
    "url": "https://freesound.org/people/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Music"
    ]
  },
  {
    "name": "Pubg",
    "url": "https://pubg.op.gg/user/{}",
    "mode": "MESSAGE",
    "notFoundText": "The player is not registered at OP.GG. Please check your spelling and search again.",
    "invalidChars": [],
    "tags": [
      "Gaming"
    ]
  },
  {
    "name": "Euw",
    "url": "https://euw.op.gg/summoner/userName={}",
    "mode": "MESSAGE",
    "notFoundText": "This summoner is not registered at OP.GG. Please check spelling.",
    "invalidChars": [],
    "tags": [
      "Gaming"
    ]
  },
  {
    "name": "Quora",
    "url": "https://www.quora.com/profile/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Questions"
    ]
  },
  {
    "name": "Wikipedia",
    "url": "https://wikipedia.org/wiki/User:{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Informations"
    ]
  },
  {
    "name": "Gravatar",
    "url": "https://gravatar.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Avatar",
      "Social"
    ]
  },
  {
    "name": "AllMyLinks",
    "url": "https://allmylinks.com/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Links"
    ]
  },
  {
    "name": "Medium",
    "url": "https://medium.com/@{}",
    "mode": "MESSAGE",
    "notFoundText": "PAGE NOT FOUND",
    "invalidChars": [
      ".",
      "_"
    ],
    "tags": [
      "Blog"
    ]
  },
  {
    "name": "SkillShare",
    "url": "https://www.skillshare.com/user/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Image"
    ]
  },
  {
    "name": "Pr0gramm",
    "url": "https://pr0gramm.com/user/{}",
    "mode": "STATUS",
    "notFoundText": "{error: notFound, code: 404, msg: Not Found}",
    "invalidChars": [],
    "tags": [
      "Programming"
    ]
  },
  {
    "name": "BinarySearch",
    "url": "https://binarysearch.com/@/{}",
    "mode": "MESSAGE",
    "notFoundText": "{}",
    "invalidChars": [],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "MixCloud",
    "url": "https://mixcloud.com/{}/",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Music"
    ]
  },
  {
    "name": "Archive.org",
    "url": "https://archive.org/details/@{}",
    "mode": "MESSAGE",
    "notFoundText": "cannot find account",
    "invalidChars": [],
    "tags": [
      "Archieve"
    ]
  },
  {
    "name": "Blogger",
    "url": "https://{}.blogspot.com",
    "mode": "STATUS",
    "invalidChars": [
      ".",
      "/"
    ],
    "tags": [
      "Blog"
    ]
  },
  {
    "name": "AudioJungle",
    "url": "https://audiojungle.net/user/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Music"
    ]
  },
  {
    "name": "DockerHub",
    "url": "https://hub.docker.com/u/{}/",
    "mode": "MESSAGE",
    "notFoundText": "User not found",
    "invalidChars": [
      ".",
      "/",
      "_"
    ],
    "tags": [
      "Programming",
      "Docker"
    ]
  },
  {
    "name": "AminoApps",
    "url": "https://aminoapps.com/u/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "SublimeForum",
    "url": "https://forum.sublimetext.com/u/{}",
    "mode": "STATUS",
    "invalidChars": [],
    "tags": [
      "Forum",
      "Sublimetext"
    ]
  },
  {
    "name": "Kik",
    "url": "https://kik.me/{}",
    "mode": "MESSAGE",
    "notFoundText": "The page you requested was not found.",
    "invalidChars": [],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "Signal-Community",
    "url": "https://community.signalusers.org/u/{}",
    "mode": "STATUS",
    "notFoundText": "Oops! That page doesn’t exist or is private.",
    "invalidChars": [],
    "tags": [
      "Social",
      "Chatting"
    ]
  },
  {
    "name": "GitLab",
    "url": "https://gitlab.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "[]",
    "invalidChars": [],
    "tags": [
      "Programming",
      "OpenSource"
    ]
  },
  {
    "name": "Wix",
    "url": "https://{}.wix.com",
    "mode": "STATUS",
    "invalidChars": [
      ".",
      "/"
    ],
    "tags": [
      "Website"
    ]
  },
  {
    "name": "UnSplash",
    "url": "https://unsplash.com/@{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Image"
    ]
  },
  {
    "name": "FacciaBuco",
    "url": "https://www.facciabuco.com/vaccheca/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "Behance",
    "url": "https://www.behance.net/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Portfolio"
    ]
  },
  {
    "name": "Hackaday",
    "url": "https://hackaday.io/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming, Hacking"
    ]
  },
  {
    "name": "Ello",
    "url": "https://ello.co/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Market"
    ]
  },
  {
    "name": "Jimdo",
    "url": "https://{}.jimdosite.com",
    "mode": "STATUS",
    "invalidChars": [
      ".",
      "/"
    ],
    "tags": [
      "Website"
    ]
  },
  {
    "name": "Keybase",
    "url": "https://keybase.io/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Key"
    ]
  },
  {
    "name": "Slack",
    "url": "https://{}.slack.com",
    "mode": "STATUS",
    "invalidChars": [
      ".",
      "/"
    ],
    "tags": [
      "Team"
    ]
  },
  {
    "name": "Camfrog",
    "url": "https://profiles.camfrog.com/en/{}",
    "mode": "MESSAGE",
    "notFoundText": "There is no user with this nickname.",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Video"
    ]
  },
  {
    "name": "YouNow",
    "url": "https://younow.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "No users found",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Streaming"
    ]
  },
  {
    "name": "ShitpostBot5000",
    "url": "https://www.shitpostbot.com/user/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Meme"
    ]
  },
  {
    "name": "Smule",
    "url": "https://www.smule.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "Smule | Page Not Found (404)",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Sing",
      "Music"
    ]
  },
  {
    "name": "OurDjTalk",
    "url": "https://ourdjtalk.com/djs/{}",
    "mode": "MESSAGE",
    "notFoundText": "The requested page could not be found.",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Music"
    ]
  },
  {
    "name": "NICommunityForum",
    "url": "https://www.native-instruments.com/profile/{}",
    "mode": "MESSAGE",
    "notFoundText": "PAGE NOT FOUND",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum"
    ]
  },
  {
    "name": "BuzzFeed",
    "url": "https://buzzfeed.com/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Feed"
    ]
  },
  {
    "name": "House-Mixes",
    "url": "https://www.house-mixes.com/profile/{}",
    "mode": "MESSAGE",
    "notFoundText": "Profile Not Found",
    "invalidChars": [
      "/",
      ".",
      "_",
      "-"
    ],
    "tags": [
      "Music"
    ]
  },
  {
    "name": "Osu!",
    "url": "https://osu.ppy.sh/users/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Gaming",
      "OSU"
    ]
  },
  {
    "name": "Dribble",
    "url": "https://dribbble.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "Whoops, that page is gone.",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Portfolio"
    ]
  },
  {
    "name": "TikTok",
    "url": "https://www.tiktok.com/@{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social",
      "Video",
      "TikTok"
    ]
  },
  {
    "name": "TheHandbook",
    "url": "https://www.thehandbook.com/influencer/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "Lookbook.nu",
    "url": "https://lookbook.nu/search/users?q={}",
    "mode": "MESSAGE",
    "notFoundText": "0 People",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Fashion",
      "Modelling"
    ]
  },
  {
    "name": "CodeAccademy",
    "url": "https://www.codecademy.com/profiles/{}",
    "mode": "MESSAGE",
    "notFoundText": "Profile Not Found | Codecademy",
    "invalidChars": [
      "/",
      "_",
      "."
    ],
    "tags": [
      "Programming"
    ]
  },
  {
    "name": "DevCommunity",
    "url": "https://dev.to/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum"
    ]
  },
  {
    "name": "CodeWars",
    "url": "https://www.codewars.com/users/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming",
      "Challange"
    ]
  },
  {
    "name": "Drupal",
    "url": "https://www.drupal.org/u/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Website"
    ]
  },
  {
    "name": "Seaport",
    "url": "https://forum.pixelfederation.com/seaport/u/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum"
    ]
  },
  {
    "name": "DiggysAdventure",
    "url": "https://forum.pixelfederation.com/diggysadventure/u/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum"
    ]
  },
  {
    "name": "Trainstation",
    "url": "https://forum.pixelfederation.com/trainstation/u/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum"
    ]
  },
  {
    "name": "Trainstation2",
    "url": "https://forum.pixelfederation.com/trainstation2/u/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum"
    ]
  },
  {
    "name": "Emporea",
    "url": "https://forum.pixelfederation.com/emporea/u/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum"
    ]
  },
  {
    "name": "PortCity",
    "url": "https://forum.pixelfederation.com/portcity/u/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum"
    ]
  },
  {
    "name": "Venmo",
    "url": "https://venmo.com/{}",
    "mode": "STATUS",
    "notFoundText": "Venmo | Page Not Found",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Payment"
    ]
  },
  {
    "name": "ThemeForest",
    "url": "https://themeforest.net/user/{}",
    "mode": "MESSAGE",
    "notFoundText": "404 - Nothing to see here",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Gaming, ThemeForest"
    ]
  },
  {
    "name": "CbtNuggets",
    "url": "https://www.cbtnuggets.com/trainers/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming",
      "Training"
    ]
  },
  {
    "name": "Periscope",
    "url": "https://www.pscp.tv/{}",
    "mode": "MESSAGE",
    "notFoundText": "Sorry, this page doesn’t exist!",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "CouchSurfing",
    "url": "https://www.couchsurfing.com/people/{}",
    "mode": "MESSAGE",
    "notFoundText": "404: not found",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Coaching",
      "Meeting",
      "Social"
    ]
  },
  {
    "name": "Minecraft",
    "url": "https://api.mojang.com/users/profiles/minecraft/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Gaming",
      "Minecraft"
    ]
  },
  {
    "name": "Ko-Fi",
    "url": "https://ko-fi.com/{}",
    "mode": "REDIRECT",
    "redirectTarget": "https://ko-fi.com/art?=redirect",
    "invalidChars": [
      "/",
      "."
    ],
    "tags": [
      "Donations"
    ]
  },
  {
    "name": "LinkGenie",
    "url": "https://linkgenie.co/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Link"
    ]
  },
  {
    "name": "Vsco",
    "url": "https://vsco.co/{}/gallery",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Image",
      "Photo"
    ]
  },
  {
    "name": "Pastebin",
    "url": "https://pastebin.com/u/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming"
    ]
  },
  {
    "name": "RubyGems",
    "url": "https://rubygems.org/profiles/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming",
      "Ruby"
    ]
  },
  {
    "name": "Asciinema",
    "url": "https://asciinema.org/~{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Video, Clip-Sharing"
    ]
  },
  {
    "name": "Milkshake",
    "url": "https://msha.ke/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Website"
    ]
  },
  {
    "name": "MyMonat",
    "url": "https://{}.mymonat.com/",
    "mode": "STATUS",
    "invalidChars": [
      "/",
      ".",
      "_"
    ],
    "tags": [
      "Health"
    ]
  },
  {
    "name": "WordPress",
    "url": "https://{}.wordpress.com",
    "mode": "MESSAGE",
    "notFoundText": "doesn&apos;t&nbsp;exist",
    "invalidChars": [
      "/",
      "_",
      "."
    ],
    "tags": [
      "Website"
    ]
  },
  {
    "name": "Gitee",
    "url": "https://gitee.com/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming",
      "OpenSource"
    ]
  },
  {
    "name": "Scratch",
    "url": "https://scratch.mit.edu/users/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming"
    ]
  },
  {
    "name": "Npm",
    "url": "https://www.npmjs.com/~{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming",
      "Npm"
    ]
  },
  {
    "name": "Mastodon",
    "url": "https://mastodon.social/@{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "Splits.io",
    "url": "https://splits.io/users/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Gaming"
    ]
  },
  {
    "name": "Speedrun",
    "url": "https://www.speedrun.com/user/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Speedrun"
    ]
  },
  {
    "name": "GameSpot",
    "url": "https://www.gamespot.com/profile/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Gaming"
    ]
  },
  {
    "name": "HubPages",
    "url": "https://hubpages.com/@{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Blog"
    ]
  },
  {
    "name": "Opensource",
    "url": "https://opensource.com/users/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "OpenSource"
    ]
  },
  {
    "name": "OpenStreetMap",
    "url": "https://www.openstreetmap.org/user/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Map"
    ]
  },
  {
    "name": "SlideShare",
    "url": "https://slideshare.net/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "File-Sharing"
    ]
  },
  {
    "name": "RateYourMusic",
    "url": "https://rateyourmusic.com/~{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Music"
    ]
  },
  {
    "name": "NotABug.org",
    "url": "https://notabug.org/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Programming"
    ]
  },
  {
    "name": "Moikrug",
    "url": "https://career.habr.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "Ошибка 404",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "NewGrounds",
    "url": "https://{}.newgrounds.com",
    "mode": "STATUS",
    "invalidChars": [
      ".",
      "_"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "Roblox",
    "url": "https://www.roblox.com/user.aspx?username={}",
    "mode": "REDIRECT",
    "redirectTarget": "https://www.roblox.com/request-error?code=404",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Gaming, Roblox"
    ]
  },
  {
    "name": "Listal.com",
    "url": "https://{}.listal.com",
    "mode": "REDIRECT",
    "redirectTarget": "https://www.listal.com",
    "invalidChars": [
      ".",
      "_"
    ],
    "tags": [
      "Image"
    ]
  },
  {
    "name": "HackerOne",
    "url": "https://hackerone.com/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Hacking"
    ]
  },
  {
    "name": "BugCrowd",
    "url": "https://bugcrowd.com/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "BugBounty",
      "Hacking"
    ]
  },
  {
    "name": "Quotev",
    "url": "https://www.quotev.com/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "JoinRoll",
    "url": "https://app.joinroll.com/{}",
    "mode": "MESSAGE",
    "notFoundText": "We could not find your account.",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Gallery"
    ]
  },
  {
    "name": "Vbox7",
    "url": "https://www.vbox7.com/user:{}",
    "mode": "MESSAGE",
    "notFoundText": "Грешка 404",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "Bitchute",
    "url": "https://www.bitchute.com/channel/{}/",
    "mode": "MESSAGE",
    "notFoundText": "404 - Page not found",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social"
    ]
  },
  {
    "name": "OpenSea",
    "url": "https://opensea.io/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Crypto"
    ]
  },
  {
    "name": "HeyLink.me",
    "url": "https://heylink.me/{}/",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Link"
    ]
  },
  {
    "name": "Ngl.link",
    "url": "https://ngl.link/{}",
    "mode": "MESSAGE",
    "notFoundText": "Could not find user",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Questions"
    ]
  },
  {
    "name": "Quizsilo",
    "url": "https://quizsilo.com/profile/{}",
    "mode": "REDIRECT",
    "redirectTarget": "https://quizsilo.com/",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Questions, Forum"
    ]
  },
  {
    "name": "ColourLovers",
    "url": "https://www.colourlovers.com/lover/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Forum",
      "Colors"
    ]
  },
  {
    "name": "21Buttons",
    "url": "https://www.21buttons.com/buttoner/{}",
    "mode": "STATUS",
    "invalidChars": [
      "/"
    ],
    "tags": [
      "Social",
      "Dressing",
      "Fashion",
      "Shopping"
    ]
  }
];
