import pytest
from products.product_models import AddProductRequestParams
from products.product_request_validator import ProductRequestValidator


class TestProductRequestValidator:
    # this method is called before each test, and here we create a new instance of the validator for each test
    def setup_method(self):
        self.validator = ProductRequestValidator()

    def test_request_without_product_name_raises_error(self):
        # Arrange
        web_url = "https://example.com"
        request = {
            "web_url": web_url,
        }

        # Act & Assert
        with pytest.raises(ValueError):
            self.validator.validate_add_product_request_params(request)

    def test_request_with_product_name_and_no_urls_raises_error(self):
        # Arrange
        product_name = "Test Product"
        request = {
            "product_name": product_name,
        }

        # Act & Assert
        with pytest.raises(ValueError):
            self.validator.validate_add_product_request_params(request)

    def test_invalid_request_type_raises_error(self):
        # Arrange
        request = "not a dict"

        # Act & Assert
        with pytest.raises(ValueError):
            self.validator.validate_add_product_request_params(request)

    def test_request_with_product_name_and_web_url_returns_request_params(self):
        # Arrange
        product_name = "Web App"
        web_url = "https://example.com"
        organisation_id = "12345"
        request = {
            "product_name": product_name,
            "web_url": web_url,
            "organisation_id": organisation_id,
        }

        # Act
        result = self.validator.validate_add_product_request_params(request)

        # Assert
        assert isinstance(result, AddProductRequestParams)
        assert result.product_name == product_name
        assert result.web_url == web_url

    def test_request_with_product_name_and_play_store_url_returns_request_params(
        self,
    ):
        # Arrange
        product_name = "Android App"
        play_store_url = "https://play.google.com/store/apps/test"
        organisation_id = "12345"
        request = {
            "product_name": product_name,
            "google_play_store_url": play_store_url,
            "organisation_id": organisation_id,
        }

        # Act
        result = self.validator.validate_add_product_request_params(request)

        # Assert
        assert isinstance(result, AddProductRequestParams)
        assert result.product_name == product_name
        assert result.google_play_store_url == play_store_url

    def test_request_with_product_name_and_app_store_url_returns_request_params(
        self,
    ):
        # Arrange
        product_name = "iOS App"
        app_store_url = "https://apps.apple.com/app/test"
        organisation_id = "12345"
        request = {
            "product_name": product_name,
            "apple_app_store_url": app_store_url,
            "organisation_id": organisation_id,
        }

        # Act
        result = self.validator.validate_add_product_request_params(request)

        # Assert
        assert isinstance(result, AddProductRequestParams)
        assert result.product_name == product_name
        assert result.apple_app_store_url == app_store_url

    def test_request_with_all_fields_returns_request_params(self):
        # Arrange
        product_name = "Multiplatform App"
        web_url = "https://example.com"
        play_store_url = "https://play.google.com/store/apps/test"
        app_store_url = "https://apps.apple.com/app/test"
        organisation_id = "12345"
        request = {
            "product_name": product_name,
            "web_url": web_url,
            "google_play_store_url": play_store_url,
            "apple_app_store_url": app_store_url,
            "organisation_id": organisation_id,
        }

        # Act
        result = self.validator.validate_add_product_request_params(request)

        # Assert
        assert isinstance(result, AddProductRequestParams)
        assert result.product_name == product_name
        assert result.web_url == web_url
        assert result.google_play_store_url == play_store_url
        assert result.apple_app_store_url == app_store_url
