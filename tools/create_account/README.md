### Usage

Accepts 6 or 7 arguments. JSON metadata is optional.

```
dotnet create_account.dll <api_url> <sign_facade_url> <sign_facade_api_key> <creator_account> <creator_account_active_private_key> <new_account_name> [<json_metadata>]
```

### Example:

```
dotnet create_account.dll http://steem-api.bcn.svc.cluster.local http://sign-facade.bil.svc.cluster.local api_key lykke.dev private_key lykkex '{"profile":{"profile_image":"https://www.lykke.com/img/lykke_new.svg"}}'
```

### JSON metadata example:

```json
{
    "profile": {
        "profile_image": "https://imgur.com/sEKbvku.jpg",
        "cover_image": "https://wallpaperscraft.com/image/planets_stars_space_universe_spots_blurring_59643_3840x1200.jpg",
        "name": "Acid",
        "about": "Manual Curator, Alt-coin enthusiast, Creator of @OCD",
        "location": "Finland",
        "website": "https://steemconnect.com/sign/account-witness-vote?witness=ocd-witness&approve=1"
    }
}
```