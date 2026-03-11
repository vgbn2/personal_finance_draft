#include <stdio.h>
void inp(int ar[1000],int t){
    for(int i=0;i<t;i++){
        scanf("%d",&ar[i]);
}
}
int main(){
    int a,b,c;scanf("%d %d",&a,&b);
    int ar[1000],br[1000];
    for(int i=0;i<a;i++){
        scanf("%d",&ar[i]);
}
for(int i=0;i<b;i++){
    scanf("%d",&br[i]);
}   
    scanf("%d",&c);
    for(int i=0;i<c;i++){
        printf("%d ",ar[i]);
    }
    for(int i=0;i<b;i++){
        printf("%d ",br[i]);
    }
    for(int i=c;i<a;i++){
        printf("%d ",ar[i]);
    }
}