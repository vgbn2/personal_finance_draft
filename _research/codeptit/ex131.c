#include <stdio.h>
#include <string.h>
#include <stdbool.h>
bool check(char s[]){
    int len=strlen(s);
    for(int i=0;i<len/2;i++){
        if(s[i]!=s[len-i-1]){
            return 0;
        }
    }
    for(int i=0;s[i];i++){
        if(s[i]=='1'||s[i]=='3'||s[i]=='5'||s[i]=='7'||s[i]=='9')
        return 0;
    }
    return 1;
}
int main(){
    int t;scanf("%d",&t);
    char s[1000];
    for(int i=0;i<t;i++){
        scanf("%s",s);
        if(check(s))printf("YES\n");
        else printf("NO\n");
    }
}