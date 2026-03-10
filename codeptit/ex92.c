#include <stdio.h>
#include <string.h>

int main() {
    int t;
    scanf("%d", &t);
   for(int i=0;i<t;i++) {
        char s[20];
        scanf("%s", s);
        int len = strlen(s);
        int countchan = 0, countle = 0;
        for (int i = 0; i < len; i++) {
            int digit = s[i] - '0';
            if (digit % 2 == 0)
                countchan++;
            else
                countle++;
        }
        int last_digit = s[len - 1] - '0';
        if (last_digit % 2 != 0 && countchan < countle)
            printf("YES\n");
        else
            printf("NO\n");
    }
    return 0;
}
