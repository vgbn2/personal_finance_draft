#include <stdio.h>
#include <string.h>
#include <stdbool.h>
bool check(char s[]){
    int len=strlen(s);
    for(int i=0;i<len/2;i++){
        if(s[i]!=s[len-i-1]){
            return 0;
        }
        if(s[i]!='2'&&s[i]!='3'&&s[i]!='5'&&s[i]!='7')
        return 0;
    }
    return 1;
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        char s[500];scanf("%s",s);
    if(check(s)){
        printf("YES\n");
    }
    else printf("NO\n");
    }
}