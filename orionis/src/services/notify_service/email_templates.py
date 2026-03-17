from config import Config, config
from string import Template


class EmailTemplates:

    def get_test_run_completion_template(self) -> dict:

        base_template = Template("""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .content { margin-bottom: 30px; }
        .footer { text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
        .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #8A3FFC;
            color: #FFFFFF;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
            font-family: Arial, sans-serif;
        }
        .status {
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-weight: bold;
        }
        .status.success { background-color: #d4edda; color: #155724; }
        .status.failure { background-color: #f8d7da; color: #721c24; }
        .status.untested {
    background-color: #fff3cd;  /* light yellow */
    color: #856404;             /* dark yellow text */
}
        .details { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .test-count { font-weight: bold; }
        .test-count.passed { color: #155724; }
        .test-count.failed { color: #721c24; }
        .test-count.untested { color: #856404; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>$header</h2>
        </div>
        <div class="content">
            <p>Hi $name,</p>
            <p>$message</p>

            <div class="details">
                <p><strong>Test Run Name:</strong> $test_run_name</p>
                <p><strong>Product:</strong> $product_name</p>
                $status_html
            </div>

            <a href="$test_run_link" class="button" style="color: #FFFFFF !important; text-decoration: none !important;">View Test Run Results</a>

            <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
        </div>
        <div class="footer">
            <p>Best Regards,<br>Team QAI</p>
        </div>
    </div>
</body>
</html>
""")

        success_template = {
            "subject": "{} Test Run Results".format(
                "(Staging)" if config.environment == Config.STAGING else ""
            ),
            "status_html": """
            <div class="status success">
                <span class="test-count passed">$success_message</span>
            </div>
        """,
            "header": "🎉 Test Run Completed",
            "message": "Your test run has finished. You can view the detailed results by clicking the button below.",
        }

        failure_template = {
            "subject": "{} Test Run Results".format(
                "(Staging)" if config.environment == Config.STAGING else ""
            ),
            "status_html": """
            <div class="status failure">
                <span class="test-count passed">$passed_count test case$passed_plural passed</span><br>
                <span class="test-count failed">$failed_count test case$failed_plural failed</span><br>
                $untested_html
            </div>
        """,
            "header": "⚠️ Test Run Completed with Failures",
            "message": "Your test run has finished with some failures. Please review the results by clicking the button below.",
        }

        all_failed_template = {
            "subject": "{} Test Run Results".format(
                "(Staging)" if config.environment == Config.STAGING else ""
            ),
            "status_html": """
            <div class="status failure">
                <span class="test-count failed">$failure_message</span>
            </div>
        """,
            "header": "❌ Test Run Failed",
            "message": "Your test run has completed, but all test cases failed. Please review the results by clicking the button below.",
        }

        all_untested_template = {
            "subject": "{} Test Run Results".format(
                "(Staging)" if config.environment == Config.STAGING else ""
            ),
            "status_html": """
    <div class="status untested">
        <span class="test-count untested">$untested_message</span>
    </div>
    """,
            "header": "⚪ Test Run Incomplete",
            "message": "Your test run did not execute any test cases. Please check the configuration or run conditions.",
        }

        return {
            "base_template": base_template,
            "success": success_template,
            "failure": failure_template,
            "all_failed": all_failed_template,
            "all_untested": all_untested_template,
        }

    def get_test_run_created_template(self) -> dict:

        base_template = Template("""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .content { margin-bottom: 30px; }
        .footer { text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
        .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #007BFF;
            color: #FFFFFF;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
            font-family: Arial, sans-serif;
        }
        .status {
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-weight: bold;
        }
        .status.info { background-color: #e6f0ff; color: #004085; }
        .details { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>$header</h2>
        </div>
        <div class="content">
            <p>Hi QA Team,</p>
            <p>$message</p>

            <div class="details">
                <p><strong>Test Run Name:</strong> $test_run_name</p>
                <p><strong>Product:</strong> $product_name</p>
                <p><strong>Test Build ID:</strong> $test_build_id</p>
                <p><strong>Device Name:</strong> $device_name</p>
                <p><strong>Created By:</strong> $created_by</p>
                <p><strong>Created At:</strong> $created_at</p>
                $status_html
            </div>

            <a href="$test_run_link" class="button" style="color: #FFFFFF !important; text-decoration: none !important;">View Test Run</a>

            <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
        </div>
        <div class="footer">
            <p>Best Regards,<br>Team QAI</p>
        </div>
    </div>
</body>
</html>
""")

        created_template = {
            "subject": "{} New Test Run Created".format(
                "(Staging)" if config.environment == Config.STAGING else ""
            ),
            "status_html": """
            <div class="status info">
                <span>Test run successfully created and is ready for execution.</span>
            </div>
        """,
            "header": "🆕 Test Run Created",
            "message": "A new test run has been created. You can monitor its progress and results by clicking the button below.",
        }

        return {"base_template": base_template, "created": created_template}
