"""Reproducible name analysis of a frozen market-cap ranking (standard library)."""
import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import hashlib
import html
import io
import json
from pathlib import Path
import re
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://companiesmarketcap.com/?download=csv'
LATIN_MAP = str.maketrans({'Ø':'O','ø':'o','Ł':'L','ł':'l','Æ':'AE','æ':'ae','Œ':'OE','œ':'oe','ß':'ss'})

def normalize_name(name):
    decoded = html.unescape(name)
    primary = re.sub(r'\([^()]*\)', '', decoded)
    primary = ' '.join(primary.split())
    decomposed = unicodedata.normalize('NFKD', primary.translate(LATIN_MAP))
    ascii_name = ''.join(ch for ch in decomposed if not unicodedata.combining(ch))
    unsupported = any(ch.isalpha() and not ch.isascii() for ch in ascii_name)
    tokens = re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*", ascii_name)
    words = []
    for token in tokens:
        value = re.sub("['’]", '', token)
        if re.fullmatch('[A-Za-z]+', value):
            words.append({'value':value.upper(), 'uppercase':len(value)>1 and value.isupper()})
    digits = any(ch.isdigit() for ch in ascii_name)
    joined = ''.join(word['value'] for word in words)
    form = joined if joined and not digits and not unsupported else None
    letters = ''.join(ch for ch in primary if ch.isalpha())
    return {'name':decoded, 'primary':primary, 'form':form, 'words':words,
            'word_count':len(tokens), 'uppercase':len(letters)>1 and letters.isupper(),
            'has_digits':digits, 'unsupported_letters':unsupported,
            'parenthetical':'(' in decoded, 'html_decoded':decoded!=name,
            'diacritics_changed':ascii_name!=primary}

def entities(companies, mode='single', typography='mixed', length=None):
    result = []
    for company in companies:
        if mode in ('single','full'):
            if mode=='single' and company['word_count']!=1:
                continue
            candidates=[{'value':company['form'],'uppercase':company['uppercase']}]
        else:
            candidates=company['words']
        seen=set()
        for token in candidates:
            value=token['value']
            if not value or not 1<=len(value)<=12 or length and len(value)!=length:
                continue
            if typography=='mixed' and token['uppercase'] or typography=='upper' and not token['uppercase']:
                continue
            if value in seen:
                continue
            seen.add(value)
            result.append({'rank':company['rank'],'name':company['name'],'value':value})
    return result

def analyze(companies, mode='single', typography='mixed', vowels='AEIOU', length=None):
    observations=entities(companies,mode,typography,length)
    pools={key:defaultdict(set) for key in ['masks','lengths','prefix2','prefix3','suffix2','suffix3','bigram','trigram','words']}
    examples=defaultdict(dict)
    flags=defaultdict(set)
    for obs in observations:
        value,rank=obs['value'],obs['rank']
        mask=''.join('V' if ch in vowels else 'C' for ch in value)
        features={'masks':{mask},'lengths':{len(value)},'words':{value}}
        for size in (2,3):
            features['prefix'+str(size)]={value[:size]} if len(value)>=size else set()
            features['suffix'+str(size)]={value[-size:]} if len(value)>=size else set()
            features['bigram' if size==2 else 'trigram']={value[i:i+size] for i in range(len(value)-size+1)}
        for kind,values in features.items():
            for key in values:
                pools[kind][key].add(rank)
                if len(examples[(kind,key)])<5:
                    examples[(kind,key)][rank]={'name':obs['name'],'form':value,'rank':rank}
        for kind,condition in [('three_consonants','CCC' in mask),('three_vowels','VVV' in mask),('double_letters',bool(re.search(r'(.)\1',value))),('inner_y','Y' in value[:-1]),('starts_vowel',mask[0]=='V'),('ends_vowel',mask[-1]=='V')]:
            if condition:flags[kind].add(rank)
    denominator=len({obs['rank'] for obs in observations})
    def table(kind):
        return [{'value':key,'companies':len(ranks),'share':len(ranks)/denominator if denominator else 0,
                 'examples':list(examples[(kind,key)].values())}
                for key,ranks in sorted(pools[kind].items(),key=lambda kv:(-len(kv[1]),str(kv[0])))]
    return {'mode':mode,'typography':typography,'vowels':vowels,'length':length,
            'denominator':denominator,'observations':len(observations),
            'tables':{kind:table(kind) for kind in pools},
            'flags':{key:len(value) for key,value in flags.items()}}

def build(data, retrieved_at):
    rows=list(csv.DictReader(io.StringIO(data.decode('utf-8-sig'))))
    required={'Rank','Name','Symbol','marketcap','country'}
    if len(rows)<1000 or not required.issubset(rows[0]):
        raise ValueError('Source is incomplete or its schema changed')
    selected=rows[:1000]
    missing={key:sum(not str(row.get(key,'')).strip() for row in selected) for key in required}
    if any(missing.values()):raise ValueError('Required source fields are missing: '+str(missing))
    assert [int(row['Rank']) for row in selected]==list(range(1,1001)), 'Rank gap'
    assert len({row['Symbol'] for row in selected})==1000, 'Duplicate symbol'
    assert len({row['Name'] for row in selected})==1000, 'Duplicate source name'
    assert all(int(row['marketcap'])>0 for row in selected), 'Invalid market cap'
    inversions=sum(int(a['marketcap'])<int(b['marketcap']) for a,b in zip(selected,selected[1:]))
    if inversions:raise ValueError('Ranking is not sorted by market cap')
    companies=[]
    for row in selected:
        company=normalize_name(row['Name'])
        company.update(rank=int(row['Rank']),source_name=row['Name'],symbol=row['Symbol'],
                       market_cap_usd=row['marketcap'],country=row['country'])
        companies.append(company)
    forms=Counter(c['form'] for c in companies if c['form'])
    quality={'companies':1000,'source_rows':len(rows),'required_missing':missing,'unique_source_names':1000,'unique_symbols':1000,
             'rank_min':1,'rank_max':1000,'market_cap_inversions':inversions,
             'html_decoded':sum(c['html_decoded'] for c in companies),
             'with_parenthetical':sum(c['parenthetical'] for c in companies),
             'diacritics_changed':sum(c['diacritics_changed'] for c in companies),
             'with_digits':sum(c['has_digits'] for c in companies),
             'unsupported_letters':sum(c['unsupported_letters'] for c in companies),
             'single_word':sum(c['word_count']==1 for c in companies),
             'multi_word':sum(c['word_count']>1 for c in companies),
             'uppercase_primary':sum(c['uppercase'] for c in companies),
             'az_forms':sum(c['form'] is not None for c in companies),
             'az_forms_1_12':sum(c['form'] is not None and len(c['form'])<=12 for c in companies),
             'az_forms_over_12':sum(c['form'] is not None and len(c['form'])>12 for c in companies),
             'duplicate_normalized_forms':{key:n for key,n in forms.items() if n>1},
             'countries':dict(Counter(c['country'] for c in companies).most_common())}
    baseline={mode:analyze(companies,mode,'all') for mode in ['full','single','tokens']}
    baseline['single_mixed']=analyze(companies,'single','mixed')
    return {'meta':{'schema':1,'source_title':'CompaniesMarketCap — Companies ranked by Market Cap',
                    'source_url':'https://companiesmarketcap.com/','download_url':SOURCE,
                    'retrieved_at_utc':retrieved_at,'snapshot_date':retrieved_at[:10],
                    'source_sha256':hashlib.sha256(data).hexdigest(),
                    'selection':'First 1000 source ranks; one listed company per row; no market-cap weighting',
                    'quality':quality,
                    'normalization':{'parenthetical':'Removed for primary form; original preserved',
                                     'html_entities':'Decoded before tokenization',
                                     'diacritics':'NFKD, combining marks removed; explicit Latin map',
                                     'digits':'Full A–Z form unavailable; digits never silently removed',
                                     'typography':'UPPERCASE is a spelling category, not proof of acronym origin',
                                     'tokens':'Latin words, apostrophes joined, hyphens/spaces separate words',
                                     'frequency':'Distinct companies per feature within selected eligible population; overlapping rows are not additive'}},
            'companies':companies,'baseline':baseline}

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path);p.add_argument('--download',action='store_true');args=p.parse_args()
    if args.download:
        with urllib.request.urlopen(urllib.request.Request(SOURCE,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as response:data=response.read()
        (ROOT/'work').mkdir(exist_ok=True);(ROOT/'work/company-source-download').write_bytes(data)
    elif args.input:data=args.input.read_bytes()
    else:p.error('Use --input frozen.csv or --download')
    captured=datetime.now(timezone.utc) if args.download else datetime.fromtimestamp(args.input.stat().st_mtime,timezone.utc)
    snapshot=build(data,captured.isoformat())
    snapshot_date=snapshot['meta']['snapshot_date']
    target=ROOT/'data';target.mkdir(exist_ok=True)
    (target/f'company-patterns-{snapshot_date}.json').write_text(json.dumps({'meta':snapshot['meta'],'companies':snapshot['companies']},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (ROOT/'reports/company-analysis.json').write_text(json.dumps({'meta':snapshot['meta'],'baseline':snapshot['baseline']},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    rows=list(csv.DictReader(io.StringIO(data.decode('utf-8-sig'))))[:1000]
    with (target/f'companies-top1000-{snapshot_date}.csv').open('w',encoding='utf-8-sig',newline='') as output:
        writer=csv.DictWriter(output,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    (ROOT/'reports/company-data-quality.json').write_text(json.dumps(snapshot['meta'],ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'quality':snapshot['meta']['quality'],'single_mixed':snapshot['baseline']['single_mixed']['denominator'],
                      'top_masks':snapshot['baseline']['single_mixed']['tables']['masks'][:8]},ensure_ascii=True,indent=2))

if __name__=='__main__':main()
