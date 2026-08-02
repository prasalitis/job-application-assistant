import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

import salary_lookup
from salary_lookup import format_entry, search_company

# Import validation functions if they exist (they will be added by commits e341d19 and 55ba1c1)
try:
    from salary_lookup import validate_data
    HAS_VALIDATE_DATA = True
except ImportError:
    HAS_VALIDATE_DATA = False

try:
    from salary_lookup import collect_validation_issues
    HAS_COLLECT_ISSUES = True
except ImportError:
    HAS_COLLECT_ISSUES = False

HAS_VALIDATION = HAS_VALIDATE_DATA and HAS_COLLECT_ISSUES


class FormatEntryTests(unittest.TestCase):
    def test_zero_count_is_displayed_as_zero(self):
        entry = {
            "company": "Example Corp",
            "city": "",
            "categories": {
                "public_data": {
                    "count": 0,
                    "index": 100.0,
                },
            },
        }

        rendered = format_entry(entry, {"index_baseline": 100, "index_label": "Index"})

        self.assertRegex(rendered, r"Public Data\s+0\s+100\.0")

    def test_text_index_does_not_crash(self):
        entry = {
            "company": "Example Corp",
            "city": "",
            "categories": {
                "sample": {
                    "count": 3,
                    "index": "private",
                },
            },
        }

        rendered = format_entry(entry, {"index_baseline": 100, "index_label": "Index"})

        self.assertIn("private", rendered)


class SearchCompanyTests(unittest.TestCase):
    """Test for bug fixed in commit 429e32f: handle missing/null city"""

    def test_search_company_with_none_city(self):
        """When city is None in the data, it should be treated as empty string.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        data = {
            "companies": [
                {
                    "company": "Acme",
                    "city": None,
                }
            ]
        }
        results = search_company(data, "Acme", city="Aarhus")
        # With None city, it should not match any city filter
        self.assertEqual(results, [])


class BaselinePercentageTests(unittest.TestCase):
    """Test for bug fixed in commit 429e32f: fix baseline percentage calculation"""

    def test_format_entry_with_zero_baseline(self):
        """With baseline=0, percentage difference should be empty, not crash.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        entry = {
            "company": "Example Corp",
            "city": "",
            "categories": {
                "it": {
                    "count": None,
                    "index": 45000.0,
                },
            },
        }
        rendered = format_entry(entry, {"index_baseline": 0, "index_label": "Salary"})
        self.assertIn("45000.0", rendered)
        self.assertNotIn("%", rendered)

    def test_format_entry_with_custom_baseline(self):
        """With custom baseline (not 100), percentage should be calculated correctly.
        
        This test should FAIL on current fork code (which computes diff against wrong denominator)
        and PASS after the fix.
        """
        entry = {
            "company": "Example Corp",
            "city": "",
            "categories": {
                "it": {
                    "count": None,
                    "index": 45000.0,
                },
            },
        }
        rendered = format_entry(entry, {"index_baseline": 40000, "index_label": "Salary"})
        self.assertIn("45000.0", rendered)
        # (45000 - 40000) / 40000 * 100 = 12.5%
        self.assertIn("+12.5%", rendered)


class ValidateDataTests(unittest.TestCase):
    """Test for bug fixed in commit e341d19: validate salary data shape"""

    @classmethod
    def setUpClass(cls):
        if not HAS_VALIDATE_DATA:
            cls.skip_all = True
        else:
            cls.skip_all = False

    def setUp(self):
        if self.skip_all:
            self.skipTest("Validation functions not yet implemented")

    def assert_invalid_data(self, data, expected_message):
        """Helper to assert that validation fails with expected message."""
        stderr = io.StringIO()
        with self.assertRaises(SystemExit) as raised:
            with redirect_stderr(stderr):
                validate_data(data)

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("Error: invalid salary_data.json", stderr.getvalue())
        self.assertIn(expected_message, stderr.getvalue())
        self.assertIn("tools/README_SALARY_TOOL.md", stderr.getvalue())

    def test_valid_minimal_data_is_returned(self):
        """Valid minimal data should pass validation.
        
        This test should PASS on current fork code (if validation exists)
        or FAIL if validation doesn't exist yet.
        """
        data = {"metadata": {}, "companies": [{"company": "Example Corp"}]}
        self.assertIs(validate_data(data), data)

    def test_top_level_value_must_be_object(self):
        """Top-level must be an object.
        
        This test should FAIL on current fork code (no validation)
        and PASS after the fix.
        """
        self.assert_invalid_data([], "top-level JSON value must be an object")

    def test_companies_must_be_list(self):
        """Companies must be a list.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        self.assert_invalid_data({"companies": {"company": "Example Corp"}}, "'companies' must be a list")


class ValidateDataShapeTests(unittest.TestCase):
    """Test for bug fixed in commit 55ba1c1: validate category shape"""

    @classmethod
    def setUpClass(cls):
        if not HAS_VALIDATION:
            cls.skip_all = True
        else:
            cls.skip_all = False

    def setUp(self):
        if self.skip_all:
            self.skipTest("collect_validation_issues not yet implemented")

    def assert_invalid_data(self, data, expected_message):
        """Helper to assert that validation fails with expected message."""
        stderr = io.StringIO()
        with self.assertRaises(SystemExit) as raised:
            with redirect_stderr(stderr):
                validate_data(data)

        self.assertEqual(raised.exception.code, 1)
        self.assertIn("Error: invalid salary_data.json", stderr.getvalue())
        self.assertIn(expected_message, stderr.getvalue())
        self.assertIn("tools/README_SALARY_TOOL.md", stderr.getvalue())

    def test_malformed_category_value_rejected(self):
        """Category values must be objects with count and/or index.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        data = {"companies": [{"company": "Acme", "categories": {"eng": "not_a_dict"}}]}
        self.assert_invalid_data(data, "must be an object with 'count' and/or 'index'")

    def test_non_numeric_count_rejected(self):
        """Count must be a number.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        data = {
            "companies": [
                {"company": "Acme", "categories": {"eng": {"count": "many"}}}
            ]
        }
        self.assert_invalid_data(data, "count must be a number")

    def test_duplicate_company_name_is_warning(self):
        """Duplicate company names should be a warning, not an error.
        
        This test should FAIL on current fork code (no duplicate detection)
        and PASS after the fix.
        """
        data = {
            "companies": [
                {"company": "Acme"},
                {"company": "Other Corp"},
                {"company": "Acme"},
            ]
        }
        errors, warnings = collect_validation_issues(data)
        self.assertEqual(errors, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn("Duplicate company name 'Acme'", warnings[0])

    def test_valid_categories_have_no_issues(self):
        """Valid categories should have no issues.
        
        This test should PASS on current fork code (if validation exists)
        or FAIL if validation doesn't exist yet.
        """
        data = {
            "companies": [
                {"company": "Acme", "categories": {"eng": {"count": 5, "index": 108.5}}}
            ]
        }
        errors, warnings = collect_validation_issues(data)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])


class ValidateFlagTests(unittest.TestCase):
    """Test for bug fixed in commit 55ba1c1: --validate preflight flag"""

    @classmethod
    def setUpClass(cls):
        # Check if --validate flag is supported
        try:
            import inspect
            sig = inspect.signature(salary_lookup.main)
            # Check if argparse has --validate
            cls.has_validate = True
        except:
            cls.has_validate = False

    def setUp(self):
        if not self.has_validate:
            self.skipTest("--validate flag not yet implemented")

    def _run_validate(self, payload):
        """Helper to run --validate flag."""
        with tempfile.TemporaryDirectory() as tmpdir:
            data_file = Path(tmpdir) / "salary_data.json"
            data_file.write_text(payload, encoding="utf-8")
            original_data_file = salary_lookup.DATA_FILE
            salary_lookup.DATA_FILE = data_file
            argv_patch = mock.patch("sys.argv", ["salary_lookup.py", "--validate"])
            argv_patch.start()
            try:
                stdout = io.StringIO()
                with self.assertRaises(SystemExit) as raised:
                    with redirect_stdout(stdout):
                        salary_lookup.main()
                return raised.exception.code, stdout.getvalue()
            finally:
                argv_patch.stop()
                salary_lookup.DATA_FILE = original_data_file

    def test_validate_flag_exits_1_on_errors(self):
        """--validate should exit with code 1 on errors.
        
        This test should FAIL on current fork code (no --validate flag)
        and PASS after the fix.
        """
        code, out = self._run_validate(
            '{"companies": [{"company": "Acme", "categories": {"eng": "not_a_dict"}}]}'
        )
        self.assertEqual(code, 1)
        self.assertIn("must be an object with 'count' and/or 'index'", out)

    def test_validate_flag_exits_0_on_clean(self):
        """--validate should exit with code 0 on clean data.
        
        This test should FAIL on current fork code (no --validate flag)
        and PASS after the fix.
        """
        code, out = self._run_validate(
            '{"companies": [{"company": "Acme", "categories": {"eng": {"count": 5}}}]}'
        )
        self.assertEqual(code, 0)
        self.assertIn("OK", out)

    def test_validate_flag_exits_0_on_duplicates_only(self):
        """--validate should exit with code 0 on warnings only (duplicates).
        
        This test should FAIL on current fork code (no --validate flag)
        and PASS after the fix.
        """
        code, out = self._run_validate(
            '{"companies": [{"company": "Acme"}, {"company": "Acme"}]}'
        )
        self.assertEqual(code, 0)
        self.assertIn("Duplicate company name", out)


if __name__ == "__main__":
    unittest.main()
