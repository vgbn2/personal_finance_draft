#include <stdio.h>
#include <string.h>
#include <ctype.h>

int main(){
char s[1000];int chu=0,kitu=0,so=0;
gets(s);
for(int i=0;s[i]!='\0';i++){
    if(isalpha(s[i]))
    chu++;
    else if(isdigit(s[i])){
        so++;
    }
    else if(s[i]!='\n') kitu++;
}
printf("%d %d %d",chu,so,kitu);
}