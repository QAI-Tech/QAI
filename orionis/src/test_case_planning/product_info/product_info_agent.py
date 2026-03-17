from urllib.parse import urlparse, parse_qs
import time
from typing import Optional
from google_play_scraper import app  # type: ignore
from test_build.test_build_models import PlatformType
import itunespy  # type: ignore
from test_case_planning.product_info.product_info_models import ProductInfo
from utils.util import orionis_log


class ProductInfoAgent:

    def get_product_info(self, url: str, platform: str) -> ProductInfo:
        """
        Fetches product information from a Google Play Store URL.
        """
        match platform:
            case PlatformType.ANDROID:
                return self._fetch_app_details_from_url(url)
            case PlatformType.IOS:
                app_id = self._extract_app_id_from_app_store_link(url=url)
                return self._get_app_store_details_itunes(app_id=app_id)
            case _:
                raise ValueError(f"Unsupported platform: {platform}")

    def _extract_app_id_from_app_store_link(self, url: str) -> str:
        # Parse the URL
        parsed_url = urlparse(url)
        path_parts = parsed_url.path.strip("/").split("/")
        print(f"parsed path: {path_parts}")
        # Look for the part starting with 'id' and extract the numeric part
        for part in path_parts:
            if part.startswith("id") and part[2:].isdigit():
                return part[2:]  # strip the "id" and return only digits

        raise ValueError("App ID not found in the URL")

    def _get_app_store_details_itunes(self, app_id: str) -> ProductInfo:
        try:
            app = itunespy.lookup(id=app_id)[0]
            return ProductInfo(
                description=app.description,
                infographic_urls=app.screenshotUrls,
            )
        except Exception as e:
            orionis_log(f"Failed to fetch app details for app_id {app_id}: {e}", e)
            raise ValueError(f"Failed to fetch app details: {e}")

    def _extract_app_id_from_url(self, url: str) -> Optional[str]:
        """
        Extracts app ID from a Play Store URL.
        Example: https://play.google.com/store/apps/details?id=com.spoony -> com.spoony
        """
        parsed_url = urlparse(url)
        query_params = parse_qs(parsed_url.query)
        return query_params.get("id", [None])[0]

    def _fetch_app_details_from_url(
        self, url: str, lang="en", country="us", retries=3, delay=2
    ) -> ProductInfo:
        """
        Fetches app details from Google Play URL with retries and error handling.
        """
        app_id = self._extract_app_id_from_url(url)
        if not app_id:
            print("Invalid URL: Could not extract app ID.")
            raise ValueError("Invalid URL: Could not extract app ID")

        for attempt in range(retries):
            try:
                result = app(app_id, lang=lang, country=country)
                return ProductInfo(
                    description=result.get("description", ""),
                    infographic_urls=result.get("screenshots", []),
                )
            except Exception as e:
                print(f"Attempt {attempt+1} failed: {e}")
                time.sleep(delay)

        print(f"All {retries} attempts failed for app ID: {app_id}")
        orionis_log(
            f"All {retries} attempts failed for app ID: {app_id}",
            Exception(f"All {retries} attempts failed for app ID: {app_id}"),
        )
        raise ValueError("Invalid URL: Could not extract app ID")
