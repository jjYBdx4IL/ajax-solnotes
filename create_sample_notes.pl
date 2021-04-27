#!/usr/bin/perl

use warnings;
use strict;

use POSIX qw(strftime);
use File::Slurp qw(read_file write_file);

my $now = time();
my $t = strftime('%Y-%m-%dT%H:%M:%S.000Z', gmtime($now));

my @files = glob("node_modules/**/*");
my %words = ();
for my $fn (@files) {
    next unless -f $fn;
    #print $fn."\n";
    my $data = read_file($fn);
    $data =~ s/([a-zA-Z]+)/$words{$1}++;/eg;
}

my @words = keys %words;

print "words discovered: ", scalar @words, "\n";

for (my $i = 0; $i < ($ARGV[0] || 10000); $i++) {
    my $totalLen = 40+rand()*rand()*2000;
    my $output = "Created: $t\n\n";
    while (length($output) < $totalLen) {
        if(length($output) > 0) {
            $output .= " ";
        }
        $output .= $words[int(rand()*(scalar @words))];
        if (rand() > 0.8) {
            $output .= "\n";
        }
    }
    write_file("repo/$i.txt", $output);
}
