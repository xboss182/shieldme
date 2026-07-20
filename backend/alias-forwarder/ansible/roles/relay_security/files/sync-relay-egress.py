#!/usr/bin/env python3
import ipaddress
import socket
import subprocess
import sys

hosts_path, table_name, set4, set6 = sys.argv[1:]
blocked4 = tuple(map(ipaddress.ip_network, [
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
    '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16',
    '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
]))
blocked6 = tuple(map(ipaddress.ip_network, [
    '::/128', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8', '2001:db8::/32',
    '64:ff9b::/96', '64:ff9b:1::/48', '100::/64', '2001::/23', '2002::/16',
    '3fff::/20', '5f00::/16',
]))

def is_public(address):
    if address.version == 6 and (address.ipv4_mapped or address.packed[:12] == b'\x00' * 12):
        return is_public(address.ipv4_mapped or ipaddress.IPv4Address(address.packed[-4:]))
    return address.is_global and not any(address in network for network in (blocked4 if address.version == 4 else blocked6))

addresses4 = set()
addresses6 = set()
with open(hosts_path, encoding='utf-8') as hosts_file:
    for raw_host in hosts_file:
        host = raw_host.strip().lower()
        if not host or host.startswith('#'):
            continue
        for family, _, _, _, sockaddr in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM):
            address = ipaddress.ip_address(sockaddr[0])
            if not is_public(address):
                raise SystemExit(f'non-public approved relay address: {host}')
            (addresses4 if family == socket.AF_INET else addresses6).add(str(address))

if not addresses4 and not addresses6:
    raise SystemExit('no approved relay addresses resolved')

rules = [
    f'table inet {table_name} {{',
    f'  set {set4} {{ type ipv4_addr; flags interval; }}',
    f'  set {set6} {{ type ipv6_addr; flags interval; }}',
    '  chain output {',
    '    type filter hook output priority filter; policy accept;',
    f'    meta skuid "shieldme" tcp dport {{ 465, 587 }} ip daddr @{set4} accept',
    f'    meta skuid "shieldme" tcp dport {{ 465, 587 }} ip6 daddr @{set6} accept',
    '    meta skuid "shieldme" tcp dport { 465, 587 } reject with icmpx type admin-prohibited',
    '  }',
    '}',
]
subprocess.run(['nft', 'delete', 'table', 'inet', table_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
subprocess.run(['nft', '-f', '-'], input='\n'.join(rules).encode(), check=True)
if addresses4:
    subprocess.run(['nft', 'add', 'element', 'inet', table_name, set4, '{ ' + ', '.join(sorted(addresses4)) + ' }'], check=True)
if addresses6:
    subprocess.run(['nft', 'add', 'element', 'inet', table_name, set6, '{ ' + ', '.join(sorted(addresses6)) + ' }'], check=True)
