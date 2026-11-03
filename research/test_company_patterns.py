import csv
import io
import json
from pathlib import Path
import unittest
from company_patterns import normalize_name, analyze, build

ROOT=Path(__file__).resolve().parents[1]
class CompanyDataTests(unittest.TestCase):
    def test_html_entities_parentheses_and_diacritics_are_explicit(self):
        company=normalize_name('Foo &amp; Bar (Alias)')
        self.assertEqual(company['primary'],'Foo & Bar')
        self.assertEqual(company['form'],'FOOBAR')
        self.assertEqual([w['value'] for w in company['words']],['FOO','BAR'])
        self.assertTrue(company['html_decoded']);self.assertTrue(company['parenthetical'])
        self.assertEqual(normalize_name("L'Oréal")['form'],'LOREAL')
        self.assertEqual(normalize_name('Ørsted')['form'],'ORSTED')
        self.assertTrue(normalize_name('NVIDIA')['uppercase'])

    def test_numeric_identity_is_not_silently_dropped(self):
        self.assertIsNone(normalize_name('3M')['form'])
        self.assertTrue(normalize_name('3M')['has_digits'])
        self.assertIsNone(normalize_name('L3Harris Technologies')['form'])
        self.assertIsNone(normalize_name('测试')['form'])

    def test_csv_is_complete_and_reproduces_frozen_primary_forms(self):
        raw=(ROOT/'data/companies-top1000-2026-11-03.csv').read_bytes()
        actual=build(raw,'test')
        frozen=json.loads((ROOT/'data/company-patterns-2026-11-03.json').read_text(encoding='utf-8'))
        self.assertEqual(actual['companies'],frozen['companies'])
        self.assertEqual(actual['meta']['quality']['companies'],1000)
        rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
        rows[1]['Rank']='1'
        output=io.StringIO();writer=csv.DictWriter(output,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
        with self.assertRaises((ValueError,AssertionError)):build(output.getvalue().encode(),'test')

    def test_repeated_words_do_not_inflate_company_frequency(self):
        company=normalize_name('Johnson & Johnson');company.update(rank=1)
        result=analyze([company],mode='tokens',typography='all')
        self.assertEqual(result['denominator'],1);self.assertEqual(result['observations'],1)
        self.assertTrue(all(r['companies']==1 for r in result['tables']['bigram']))

if __name__=='__main__':unittest.main()
