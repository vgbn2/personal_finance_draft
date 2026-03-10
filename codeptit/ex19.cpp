#include <stdio.h>

int main() {
    int t;
    scanf("%d", &t);
    while (t--) {
        long long n;
        scanf("%lld", &n);
        char max_digit = '0', min_digit = '9';
        while (n > 0) {
            char digit = (n % 10) + '0';//exp 1234-.n%10=4;'4'+'0'('0'in ascii value)
            if (digit > max_digit) max_digit = digit;
            if (digit < min_digit) min_digit = digit;
            n /= 10;
        }
        printf("%c %c\n", max_digit, min_digit);
    }
    return 0;
}
