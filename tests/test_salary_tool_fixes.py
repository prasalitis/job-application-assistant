"""
Tests for salary tool bugs that need to be fixed.
These tests should FAIL on the current fork code and PASS after the fix.

Based on upstream commits:
- aa7c707: fix(convert_salary_excel): store standalone count columns as counts, not indexes (#230)
- 3609f58: fix(convert_salary_excel): pair count/index columns by category name, not adjacency (#219)
"""
import unittest
from types import SimpleNamespace
from tools.convert_salary_excel import parse_sheet


class FakeWorksheet:
    title = "Sheet1"

    def __init__(self, rows):
        self.rows = rows

    def iter_rows(self, min_row=1, max_row=None, values_only=False):
        rows = self.rows[min_row - 1:max_row]
        for row in rows:
            if values_only:
                yield row
            else:
                yield [SimpleNamespace(value=value) for value in row]

    def __getitem__(self, row_number):
        return [SimpleNamespace(value=value) for value in self.rows[row_number - 1]]


class TestStandaloneCountColumnBug(unittest.TestCase):
    """Test for bug fixed in commit aa7c707: standalone count columns stored as indexes"""

    def test_standalone_count_column_is_stored_as_count_not_index(self):
        """A count column with no matching index column (e.g. a lone total
        headcount) should be stored as count data, not as a salary index.
        
        This test should FAIL on current fork code (which stores it as index)
        and PASS after applying the fix from commit aa7c707.
        """
        ws = FakeWorksheet([
            ("Company", "Antal", "IT Count", "IT Index"),
            ("Example Corp", 250, 30, 108.5),
        ])

        companies = parse_sheet(ws)
        categories = companies[0]["categories"]

        # The bug: standalone "Antal" (count) column is stored as index
        # The fix: it should be stored as count
        print(f"Categories: {categories}")
        
        # Check that "antal" is stored as count, not index
        self.assertIn("antal", categories)
        self.assertEqual(categories["antal"], {"count": 250})
        
        # Check that "it" is correctly paired as count and index
        self.assertIn("it", categories)
        self.assertEqual(categories["it"], {"count": 30, "index": 108.5})


class TestColumnPairingBug(unittest.TestCase):
    """Test for bug fixed in commit 3609f58: columns paired by adjacency instead of name"""

    def test_parse_sheet_pairs_interleaved_count_index_columns_by_name(self):
        """Interleaved columns like Count_A, Count_B, Index_A, Index_B should be
        paired by matching category names, not by adjacency.
        
        This test should FAIL on current fork code (which pairs by adjacency:
        Count_A -> Index_A, Count_B -> Index_B is correct, but the old code
        would pair Count_A -> Count_B and Index_A -> Index_B)
        and PASS after applying the fix from commit 3609f58.
        """
        ws = FakeWorksheet([
            ("Company", "Antal kvinder", "Antal mænd", "Kvinder indeks", "Mænd indeks"),
            ("Example Corp", 15, 20, 95.0, 108.0),
        ])

        companies = parse_sheet(ws)
        categories = companies[0]["categories"]

        print(f"Categories: {categories}")
        
        # Check that columns are paired by name, not adjacency
        # "Antal kvinder" (Count women) should pair with "Kvinder indeks" (Women index)
        # "Antal mænd" (Count men) should pair with "Mænd indeks" (Men index)
        self.assertIn("kvinder", categories)
        self.assertEqual(categories["kvinder"], {"count": 15, "index": 95.0})
        
        self.assertIn("mænd", categories)
        self.assertEqual(categories["mænd"], {"count": 20, "index": 108.0})

    def test_parse_sheet_non_adjacent_columns_no_cross_match(self):
        """Non-adjacent count and index columns should not cross-match.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        ws = FakeWorksheet([
            ("Company", "Count_A", "Count_B", "Index_A", "Index_B"),
            ("Example Corp", 10, 20, 100.0, 200.0),
        ])

        companies = parse_sheet(ws)
        categories = companies[0]["categories"]

        print(f"Categories: {categories}")
        
        # Check that Count_A pairs with Index_A, not Index_B
        self.assertIn("a", categories)
        self.assertEqual(categories["a"], {"count": 10, "index": 100.0})
        
        # Check that Count_B pairs with Index_B, not Index_A
        self.assertIn("b", categories)
        self.assertEqual(categories["b"], {"count": 20, "index": 200.0})


class TestCityColumnTokenMatch(unittest.TestCase):
    """Test for bug fixed in commit b3b3516: city column detection with token matching"""

    def test_parse_sheet_detects_city_column_with_token_header(self):
        """City headers should be matched with header_matches(), not exact string equality.
        Real-world sheets rarely use the bare token "City" or "Kommune" alone; headers
        like "City Name" / "City/Kommune" must still be detected as the city column.
        
        This test should FAIL on current fork code (which uses exact match)
        and PASS after applying the fix from commit b3b3516.
        """
        for header in ("City", "City Name", "Kommune", "City/Kommune"):
            with self.subTest(header=header):
                ws = FakeWorksheet([
                    ("Company", header, "Salary"),
                    ("Example Corp", "Aarhus", 105.5),
                ])
                companies = parse_sheet(ws)
                self.assertEqual(len(companies), 1)
                self.assertEqual(companies[0]["city"], "Aarhus")


class TestCompanyColumnTokenMatch(unittest.TestCase):
    """Test for bug fixed in commit 4128ca0: company column detection with token matching"""

    def test_parse_sheet_detects_company_column_with_token_header(self):
        """Company headers should be matched with header_matches(), not exact string equality.
        Real-world sheets rarely use the bare token "Company"; headers like "Company Name"
        or "Employer Name" must still be detected as the company column.
        
        This test should FAIL on current fork code (which uses exact match)
        and PASS after applying the fix from commit 4128ca0.
        """
        for header in ("Company", "Company Name", "Employer Name"):
            with self.subTest(header=header):
                ws = FakeWorksheet([
                    (header, "Salary"),
                    ("Example Corp", 105.5),
                ])
                companies = parse_sheet(ws)
                self.assertEqual(len(companies), 1)
                self.assertEqual(companies[0]["company"], "Example Corp")
                self.assertEqual(
                    companies[0]["categories"]["salary"], {"index": 105.5}
                )

    def test_parse_sheet_detects_company_column_in_header_row_search(self):
        """Company column detection in header row search should also use token matching.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        ws = FakeWorksheet([
            ("Company Name", "Salary"),
            ("Example Corp", 105.5),
        ])
        companies = parse_sheet(ws)
        # If header row is not detected, companies will be empty
        self.assertEqual(len(companies), 1)
        self.assertEqual(companies[0]["company"], "Example Corp")


class TestSkipNonNumericColumns(unittest.TestCase):
    """Test for bug fixed in commit 1417e3c: skip non-numeric and identifier columns"""

    def test_skips_free_text_column(self):
        """A free-text "Notes" column must not become a bogus salary category.
        
        This test should FAIL on current fork code (which treats it as a category)
        and PASS after applying the fix from commit 1417e3c.
        """
        ws = FakeWorksheet([
            ("Company", "Salary Index", "Notes"),
            ("Example Corp", 105.5, "good"),
        ])

        companies = parse_sheet(ws)

        self.assertIn("salary_index", companies[0]["categories"])
        self.assertNotIn("notes", companies[0]["categories"])

    def test_skips_numeric_identifier_column(self):
        """A numeric "Id" column (employee id) must not be treated as a salary index.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        ws = FakeWorksheet([
            ("Company", "Salary Index", "Id"),
            ("Example Corp", 105.5, 7),
        ])

        companies = parse_sheet(ws)

        self.assertIn("salary_index", companies[0]["categories"])
        self.assertNotIn("id", companies[0]["categories"])

    def test_skips_personnummer_column(self):
        """A "Personnummer" (Danish ID) column must not be treated as a salary category.
        
        This test should FAIL on current fork code and PASS after the fix.
        """
        ws = FakeWorksheet([
            ("Company", "Salary Index", "Personnummer"),
            ("Example Corp", 105.5, 1234567890),
        ])

        companies = parse_sheet(ws)

        self.assertIn("salary_index", companies[0]["categories"])
        self.assertNotIn("personnummer", companies[0]["categories"])


if __name__ == "__main__":
    unittest.main()
