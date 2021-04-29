#!/usr/bin/perl

use warnings;
use strict;

use POSIX qw(strftime);
use File::Slurp qw(read_file write_file);

my $now = time();
sub header {
    my $i = shift;
    my $t = strftime('%Y-%m-%dT%H:%M:%S.000Z', gmtime($now + $i));
    return "Created: $t\n\n";
}

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

my $max = $ARGV[0] || 10000;
for (my $i = 0; $i < $max; $i++) {
    my $totalLen = 40+rand()*rand()*2000;
    my $output = header($max-$i);
    my $newline = 1;
    while (length($output) < $totalLen) {
        if(!$newline) {
            $output .= " ";
        }
        $output .= $words[int(rand()*(scalar @words))];
        $newline = 0;
        if (rand() > 0.8) {
            $output .= "\n";
            $newline = 1;
        }
    }
    $output .= "\n#$i";
    write_file("repo/20210304T$i.txt", $output);
}
