#include <stdio.h>
#include <string.h>
int check(int ar[100],int a){
    for(int k=0;k<a/2;k++){
        if(ar[k]!=ar[a-k-1]){
         return 0;
        }
    }
return 1;
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        int a,ar[100];scanf("%d",&a);
        for(int j=0;j<a;j++){
            scanf("%d",&ar[j]);
        }
        if(check(ar,a)==1)printf("YES\n");
        else printf("NO\n");
    }
}